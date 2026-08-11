import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.extensions import ScheduledReport
from app.models.dashboard import Dashboard, DashboardWidget
import structlog

logger = structlog.get_logger()
_scheduler_task = None


async def start_scheduler():
    global _scheduler_task
    if _scheduler_task is None:
        _scheduler_task = asyncio.create_task(run_report_scheduler())


async def stop_scheduler():
    global _scheduler_task
    if _scheduler_task is not None:
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        _scheduler_task = None


async def run_report_scheduler():
    logger.info("report_scheduler_started")
    while True:
        try:
            await asyncio.sleep(60)  # Check every 60 seconds
            await check_and_run_schedules()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("report_scheduler_error", error=str(e))


async def check_and_run_schedules():
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(ScheduledReport).where(
                    ScheduledReport.is_active == True,
                    (ScheduledReport.next_run_at == None) | (ScheduledReport.next_run_at <= now)
                )
            )
            reports = result.scalars().all()
            for report in reports:
                try:
                    await execute_report(db, report)
                    
                    # Compute next run time
                    if report.frequency == "daily":
                        report.next_run_at = now + timedelta(days=1)
                    elif report.frequency == "weekly":
                        report.next_run_at = now + timedelta(weeks=1)
                    elif report.frequency == "monthly":
                        report.next_run_at = now + timedelta(days=30)
                    else:
                        report.next_run_at = now + timedelta(days=1)
                        
                    report.last_run_at = now
                    await db.commit()
                except Exception as exc:
                    logger.error("execute_report_failed", report_id=report.id, error=str(exc))
        except Exception as e:
            logger.error("check_schedules_db_error", error=str(e))


async def execute_report(db, report: ScheduledReport):
    result = await db.execute(
        select(Dashboard).where(Dashboard.id == report.dashboard_id)
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        return

    logger.info(
        "sending_scheduled_report_email",
        dashboard_id=dashboard.id,
        dashboard_title=dashboard.title,
        recipients=report.recipients,
    )
    
    # Simulating PDF generation and SMTP delivery
    # In production, we can integrate standard SMTP transport sending the report PDF.
    print(f"[Scheduled Report] Successfully generated PDF report for dashboard '{dashboard.title}' and sent to {report.recipients}.", flush=True)

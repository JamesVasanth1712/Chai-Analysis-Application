from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def seed_default_templates():
    from sqlalchemy import select
    from app.models.extensions import DashboardTemplate
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(DashboardTemplate).limit(1))
            exists = result.scalar_one_or_none()
            if exists:
                return
            
            templates = [
                DashboardTemplate(
                    name="Sales Dashboard",
                    category="Sales",
                    description="Analyze sales performance, representative metrics, and growth trends.",
                    layout_config={
                        "widgets": [
                            {
                                "title": "Total Revenue",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Total Transaction Count",
                                "chart_type": "card",
                                "slot": "row_count",
                                "agg_func": "COUNT",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Average Transaction Value",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "AVG",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Sales Performance by Representative",
                                "chart_type": "bar",
                                "slot": "category_1",
                                "metric_slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Sales Volume by Region",
                                "chart_type": "pie",
                                "slot": "category_2",
                                "metric_slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Sales Growth Trend",
                                "chart_type": "line",
                                "slot": "date_1",
                                "metric_slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 12,
                                "height": 4
                            }
                        ]
                    }
                ),
                DashboardTemplate(
                    name="Marketing Dashboard",
                    category="Marketing",
                    description="Monitor campaign stats, lead distributions, and channel effectiveness.",
                    layout_config={
                        "widgets": [
                            {
                                "title": "Total Lead Count",
                                "chart_type": "card",
                                "slot": "row_count",
                                "agg_func": "COUNT",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Average Engagement Score",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "AVG",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Conversion Rate Average",
                                "chart_type": "card",
                                "slot": "secondary_metric",
                                "agg_func": "AVG",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Lead Acquisition by Channel",
                                "chart_type": "bar",
                                "slot": "category_1",
                                "agg_func": "COUNT",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Campaign Distribution",
                                "chart_type": "pie",
                                "slot": "category_2",
                                "agg_func": "COUNT",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Lead Volume Timeline",
                                "chart_type": "line",
                                "slot": "date_1",
                                "agg_func": "COUNT",
                                "width": 12,
                                "height": 4
                            }
                        ]
                    }
                ),
                DashboardTemplate(
                    name="Finance Dashboard",
                    category="Finance",
                    description="Evaluate balance dynamics, expenditures, and net income values.",
                    layout_config={
                        "widgets": [
                            {
                                "title": "Total Operating Revenue",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Operating Margin Average",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "AVG",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Transactions Volume",
                                "chart_type": "card",
                                "slot": "row_count",
                                "agg_func": "COUNT",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Revenue Contributions by Source",
                                "chart_type": "bar",
                                "slot": "category_1",
                                "metric_slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Cost Share by Operations Unit",
                                "chart_type": "pie",
                                "slot": "category_2",
                                "metric_slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Expenditure Trend Over Time",
                                "chart_type": "line",
                                "slot": "date_1",
                                "metric_slot": "primary_metric",
                                "agg_func": "SUM",
                                "width": 12,
                                "height": 4
                            }
                        ]
                    }
                ),
                DashboardTemplate(
                    name="HR Dashboard",
                    category="Human Resources",
                    description="View employee density, tenure figures, and recruitment details.",
                    layout_config={
                        "widgets": [
                            {
                                "title": "Total Employee Count",
                                "chart_type": "card",
                                "slot": "row_count",
                                "agg_func": "COUNT",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Average Employee Tenure",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "AVG",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Total Departments Scoped",
                                "chart_type": "card",
                                "slot": "category_1",
                                "agg_func": "DISTINCT_COUNT",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Staff Headcount by Department",
                                "chart_type": "bar",
                                "slot": "category_1",
                                "agg_func": "COUNT",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Staff Distribution by Job Role",
                                "chart_type": "pie",
                                "slot": "category_2",
                                "agg_func": "COUNT",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Hiring Speed Timeline",
                                "chart_type": "line",
                                "slot": "date_1",
                                "agg_func": "COUNT",
                                "width": 12,
                                "height": 4
                            }
                        ]
                    }
                ),
                DashboardTemplate(
                    name="Operations Dashboard",
                    category="Operations",
                    description="Analyze incident reports, system runtimes, and efficiency levels.",
                    layout_config={
                        "widgets": [
                            {
                                "title": "Active Operations Count",
                                "chart_type": "card",
                                "slot": "row_count",
                                "agg_func": "COUNT",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Average System Delay Time",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "AVG",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Peak Operations Load",
                                "chart_type": "card",
                                "slot": "primary_metric",
                                "agg_func": "MAX",
                                "width": 4,
                                "height": 3
                            },
                            {
                                "title": "Task Load by Branch Location",
                                "chart_type": "bar",
                                "slot": "category_1",
                                "agg_func": "COUNT",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Error Incidents by Server Group",
                                "chart_type": "pie",
                                "slot": "category_2",
                                "agg_func": "COUNT",
                                "width": 6,
                                "height": 4
                            },
                            {
                                "title": "Operational Load Trends",
                                "chart_type": "line",
                                "slot": "date_1",
                                "agg_func": "COUNT",
                                "width": 12,
                                "height": 4
                            }
                        ]
                    }
                )
            ]
            session.add_all(templates)
            await session.commit()
            print("Database templates seeded successfully!")
        except Exception as e:
            print("Error seeding templates:", str(e))


async def create_tables():
    async with engine.begin() as conn:
        try:
            await conn.run_sync(Base.metadata.create_all)
            print("Database tables created successfully")
        except Exception as e:
            print("Database tables already exist or error occurred:", str(e))
    
    # Run templates seeding
    await seed_default_templates()

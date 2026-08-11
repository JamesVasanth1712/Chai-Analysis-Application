"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  LogOut,
  Settings,
  Shield,
  User,
  Users,
  Plus,
  Trash2,
  Mail,
  RefreshCw,
  Key,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { settingsApi, usersApi, teamApi, dataApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"account" | "connections" | "team">("account");

  // Tab 1: Account / DB URL States
  const [dbUrl, setDbUrl] = useState("");
  const [savedDbUrl, setSavedDbUrl] = useState("");
  const [dbLoading, setDbLoading] = useState(true);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState<"idle" | "ok" | "error">("idle");
  const [dbError, setDbError] = useState("");

  // Tab 2: Connectors States
  const [connectors, setConnectors] = useState<any[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [showAddConnector, setShowAddConnector] = useState(false);
  const [connName, setConnName] = useState("");
  const [connType, setConnType] = useState("postgresql"); // postgresql|mysql|sqlite
  const [connHost, setConnHost] = useState("");
  const [connPort, setConnPort] = useState("");
  const [connDbName, setConnDbName] = useState("");
  const [connUser, setConnUser] = useState("");
  const [connPassword, setConnPassword] = useState("");
  const [connFilePath, setConnFilePath] = useState(""); // for sqlite
  const [connectorTesting, setConnectorTesting] = useState(false);
  const [connectorSaving, setConnectorSaving] = useState(false);

  // Tab 3: Team States
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  // Load active DB URL
  useEffect(() => {
    settingsApi.getDatabase()
      .then((data) => {
        setSavedDbUrl(data.db_url || "");
        setDbUrl(data.db_url || "");
      })
      .catch(() => {})
      .finally(() => setDbLoading(false));
  }, []);

  // Load Connectors
  const loadConnectors = useCallback(async () => {
    setConnectorsLoading(true);
    try {
      const data = await dataApi.listConnectors();
      setConnectors(data || []);
    } catch {
      toast.error("Failed to load database connectors");
    } finally {
      setConnectorsLoading(false);
    }
  }, []);

  // Load Team members & invitations
  const loadTeamData = useCallback(async () => {
    setMembersLoading(true);
    setInvitationsLoading(true);
    try {
      const [membersData, invitesData] = await Promise.all([
        usersApi.list(),
        teamApi.listInvitations(),
      ]);
      setMembers(membersData || []);
      setInvitations(invitesData || []);
    } catch {
      toast.error("Failed to load team data");
    } finally {
      setMembersLoading(false);
      setInvitationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "connections") {
      loadConnectors();
    } else if (activeTab === "team") {
      loadTeamData();
    }
  }, [activeTab, loadConnectors, loadTeamData]);

  // DB URL actions
  const handleTestConnection = async () => {
    if (!dbUrl.trim()) {
      toast.error("Enter a database URL first");
      return;
    }
    setDbTesting(true);
    setDbStatus("idle");
    setDbError("");
    try {
      await settingsApi.testDatabase(dbUrl.trim());
      setDbStatus("ok");
      toast.success("Connection successful");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setDbStatus("error");
      setDbError(error.response?.data?.detail || "Connection failed");
      toast.error("Connection test failed");
    } finally {
      setDbTesting(false);
    }
  };

  const handleSaveDatabase = async () => {
    setDbSaving(true);
    try {
      await settingsApi.saveDatabase(dbUrl.trim());
      setSavedDbUrl(dbUrl.trim());
      toast.success("Database connection saved");
    } catch {
      toast.error("Failed to save database settings");
    } finally {
      setDbSaving(false);
    }
  };

  // Connectors actions
  const handleAddConnector = async () => {
    if (!connName.trim()) {
      toast.error("Please enter a connection name");
      return;
    }
    setConnectorSaving(true);
    
    let credentials: Record<string, any> = {};
    if (connType === "sqlite") {
      if (!connFilePath.trim()) {
        toast.error("Please specify SQLite database path");
        setConnectorSaving(false);
        return;
      }
      credentials = { filepath: connFilePath.trim() };
    } else {
      if (!connHost.trim() || !connDbName.trim()) {
        toast.error("Please fill in Host and Database name");
        setConnectorSaving(false);
        return;
      }
      credentials = {
        host: connHost.trim(),
        port: parseInt(connPort) || (connType === "mysql" ? 3306 : 5432),
        dbname: connDbName.trim(),
        user: connUser.trim(),
        password: connPassword.trim(),
      };
    }

    try {
      await dataApi.createConnector({
        name: connName.trim(),
        type: connType,
        credentials,
      });
      toast.success("Connector created successfully!");
      setShowAddConnector(false);
      setConnName("");
      setConnHost("");
      setConnPort("");
      setConnDbName("");
      setConnUser("");
      setConnPassword("");
      setConnFilePath("");
      loadConnectors();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to create connector";
      toast.error(msg);
    } finally {
      setConnectorSaving(false);
    }
  };

  const handleTestConnector = async () => {
    if (!connName.trim()) {
      toast.error("Please enter a connection name");
      return;
    }
    setConnectorTesting(true);
    
    let credentials: Record<string, any> = {};
    if (connType === "sqlite") {
      credentials = { filepath: connFilePath.trim() };
    } else {
      credentials = {
        host: connHost.trim(),
        port: parseInt(connPort) || (connType === "mysql" ? 3306 : 5432),
        dbname: connDbName.trim(),
        user: connUser.trim(),
        password: connPassword.trim(),
      };
    }

    try {
      await dataApi.testConnector({
        name: connName.trim(),
        type: connType,
        credentials,
      });
      toast.success("Connection test successful!");
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Connection failed";
      toast.error(msg);
    } finally {
      setConnectorTesting(false);
    }
  };

  const handleDeleteConnector = async (id: string) => {
    if (!confirm("Are you sure you want to remove this connector?")) return;
    try {
      await dataApi.deleteConnector(id);
      toast.success("Connector deleted");
      loadConnectors();
    } catch {
      toast.error("Failed to delete connector");
    }
  };

  // Team actions
  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Enter a valid email address");
      return;
    }
    setInviting(true);
    try {
      await teamApi.createInvitation({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      loadTeamData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Invitation failed";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await teamApi.revokeInvitation(id);
      toast.success("Invitation revoked");
      loadTeamData();
    } catch {
      toast.error("Failed to revoke invitation");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Platform Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure external database pipelines, manage user roles, and customize account details.
        </p>
      </div>

      {/* Horizontal Tabs */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab("account")}
          className={`px-4 py-2 border-b-2 font-semibold text-sm transition-all cursor-pointer ${
            activeTab === "account"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Account & Profile
        </button>
        <button
          onClick={() => setActiveTab("connections")}
          className={`px-4 py-2 border-b-2 font-semibold text-sm transition-all cursor-pointer ${
            activeTab === "connections"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Data Connections
        </button>
        <button
          onClick={() => setActiveTab("team")}
          className={`px-4 py-2 border-b-2 font-semibold text-sm transition-all cursor-pointer ${
            activeTab === "team"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Team & Members
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        {/* ================= ACCOUNT TAB ================= */}
        {activeTab === "account" && (
          <div className="space-y-6 animate-slide-up">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <User className="h-4.5 w-4.5 text-primary" /> Profile Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
                    {user?.full_name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                  <div>
                    <p className="font-semibold">{user?.full_name ?? "-"}</p>
                    <p className="text-sm text-muted-foreground">{user?.email ?? "-"}</p>
                    <Badge variant="secondary" className="mt-1 text-xs capitalize">
                      Role: {user?.role}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Layers className="h-4.5 w-4.5 text-primary" /> Workspace Tenant Context
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border/50 py-2">
                    <span className="text-muted-foreground">Tenant ID</span>
                    <span className="font-mono text-xs text-foreground/80">{user?.tenant_id ?? "-"}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 py-2">
                    <span className="text-muted-foreground">Language Locale</span>
                    <span className="font-mono text-xs">{user?.preferred_language ?? "en"}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">Assigned RBAC Permission</span>
                    <span className="capitalize text-primary font-medium">{user?.role ?? "-"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Shield className="h-4.5 w-4.5 text-primary" /> Authentication Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
                  Session sessions are encrypted with secure JWT (JSON Web Tokens). Tokens auto-expire after 24 hours. Sign out below to end active sessions on this device.
                </p>
                <Button variant="destructive" size="sm" onClick={logout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out of platform
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ================= CONNECTIONS TAB ================= */}
        {activeTab === "connections" && (
          <div className="space-y-6 animate-slide-up">
            {/* Primary PostgreSQL URL Connection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Database className="h-4.5 w-4.5 text-primary" /> Primary Workspace Database
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect a main analytical database URL. For maximum safety, connections are established in strict read-only mode executing SELECT queries.
                </p>

                {dbLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading connection status...
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-slate-500">Database Connection URI</label>
                      <Input
                        type="password"
                        value={dbUrl}
                        onChange={(event) => {
                          setDbUrl(event.target.value);
                          setDbStatus("idle");
                        }}
                        placeholder="postgresql://user:password@host:5432/dbname"
                        className="font-mono text-xs text-slate-800"
                      />
                    </div>

                    {dbStatus === "ok" && (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Connection test successful!
                      </div>
                    )}
                    {dbStatus === "error" && (
                      <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium bg-red-500/5 p-2 rounded border border-red-500/10">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {dbError}
                      </div>
                    )}
                    {savedDbUrl && savedDbUrl === dbUrl && (
                      <p className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> This connection is currently active.
                      </p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={dbTesting || !dbUrl.trim()} className="cursor-pointer text-xs">
                        {dbTesting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Test Connection
                      </Button>
                      <Button size="sm" onClick={handleSaveDatabase} disabled={dbSaving || !dbUrl.trim()} className="cursor-pointer text-xs">
                        {dbSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save Settings
                      </Button>
                      {savedDbUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/5 text-xs cursor-pointer"
                          onClick={async () => {
                            setDbUrl("");
                            await settingsApi.saveDatabase("").catch(() => {});
                            setSavedDbUrl("");
                            toast.success("External database disconnected");
                          }}
                        >
                          Disconnect
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Sub-Connectors Manager */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Database className="h-4.5 w-4.5 text-indigo-500" /> Database Connectors
                </CardTitle>
                {!showAddConnector && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddConnector(true)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Connector
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Register additional databases (Postgres, MySQL, SQLite, DuckDB) as independent catalog connectors for multiple datasets.
                </p>

                {showAddConnector && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3.5 text-slate-800 animate-slide-up">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Configure Database Source</span>
                      <button
                        onClick={() => setShowAddConnector(false)}
                        className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Connection Name</label>
                        <Input
                          type="text"
                          value={connName}
                          onChange={(e) => setConnName(e.target.value)}
                          placeholder="e.g. Analytics Data"
                          className="h-8 text-xs text-slate-800 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Database Engine Type</label>
                        <select
                          value={connType}
                          onChange={(e) => setConnType(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded h-8 px-2.5 text-xs text-slate-800"
                        >
                          <option value="postgresql">PostgreSQL</option>
                          <option value="mysql">MySQL</option>
                          <option value="sqlite">SQLite</option>
                          <option value="duckdb">DuckDB</option>
                        </select>
                      </div>
                    </div>

                    {connType === "sqlite" || connType === "duckdb" ? (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">Database File Path (on system)</label>
                        <Input
                          type="text"
                          value={connFilePath}
                          onChange={(e) => setConnFilePath(e.target.value)}
                          placeholder="e.g. C:/data/analytics.sqlite"
                          className="h-8 text-xs text-slate-800 bg-white"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Host Endpoint</label>
                            <Input
                              type="text"
                              value={connHost}
                              onChange={(e) => setConnHost(e.target.value)}
                              placeholder="e.g. localhost"
                              className="h-8 text-xs text-slate-800 bg-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Port</label>
                            <Input
                              type="text"
                              value={connPort}
                              onChange={(e) => setConnPort(e.target.value)}
                              placeholder={connType === "mysql" ? "3306" : "5432"}
                              className="h-8 text-xs text-slate-800 bg-white"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">Database Name</label>
                          <Input
                            type="text"
                            value={connDbName}
                            onChange={(e) => setConnDbName(e.target.value)}
                            placeholder="e.g. dev_db"
                            className="h-8 text-xs text-slate-800 bg-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Username</label>
                            <Input
                              type="text"
                              value={connUser}
                              onChange={(e) => setConnUser(e.target.value)}
                              placeholder="e.g. postgres"
                              className="h-8 text-xs text-slate-800 bg-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Password</label>
                            <Input
                              type="password"
                              value={connPassword}
                              onChange={(e) => setConnPassword(e.target.value)}
                              placeholder="••••••••"
                              className="h-8 text-xs text-slate-800 bg-white"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-1 border-t border-slate-200">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTestConnector}
                        disabled={connectorTesting}
                        className="h-8 text-xs cursor-pointer"
                      >
                        {connectorTesting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Test Connection
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddConnector}
                        disabled={connectorSaving}
                        className="h-8 text-xs cursor-pointer"
                      >
                        {connectorSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save Connector
                      </Button>
                    </div>
                  </div>
                )}

                {connectorsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : connectors.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4 border border-dashed border-border rounded-lg">
                    No secondary database connectors registered yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {connectors.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 border border-border/80 bg-slate-900/10 rounded-lg hover:border-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 text-xs font-bold uppercase">
                            {c.type.slice(0, 3)}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-foreground">{c.name}</h4>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                              {c.type === "sqlite" || c.type === "duckdb"
                                ? c.credentials?.filepath
                                : `${c.credentials?.host}:${c.credentials?.port}/${c.credentials?.dbname}`}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteConnector(c.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded border border-transparent hover:border-red-500/10 transition-colors cursor-pointer"
                          title="Delete connector"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ================= TEAM TAB ================= */}
        {activeTab === "team" && (
          <div className="space-y-6 animate-slide-up">
            {/* Invite User Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Mail className="h-4.5 w-4.5 text-primary" /> Invite Team Member
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Send email invitations. The users will receive a secure token which maps their registration details automatically to this tenant group.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recipient Email</label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="e.g. colleague@company.com"
                      className="text-slate-800"
                    />
                  </div>
                  <div className="w-full sm:w-40 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Access Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-background border border-border rounded h-10 px-2 text-xs text-slate-100"
                    >
                      <option value="admin">Administrator</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                </div>

                <Button onClick={handleInviteUser} disabled={inviting || !inviteEmail.trim()} className="cursor-pointer text-xs">
                  {inviting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Send Invitation Access <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Active Members List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Users className="h-4.5 w-4.5 text-primary" /> Active Tenant Members ({members.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {membersLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
                            {m.full_name?.[0]?.toUpperCase() ?? "U"}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{m.full_name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{m.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary">
                          {m.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Invitations List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Mail className="h-4.5 w-4.5 text-indigo-500" /> Pending Invitations ({invitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invitationsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : invitations.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4 border border-dashed border-border rounded-lg">
                    No pending invites currently awaiting login actions.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {invitations.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between p-3 border border-border/80 bg-slate-900/5 rounded-lg hover:border-slate-800 transition-all"
                      >
                        <div>
                          <p className="text-xs font-bold text-foreground">{invite.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[9px] uppercase tracking-wider px-1 font-semibold">
                              {invite.role}
                            </Badge>
                            <span className="text-[9px] text-slate-500 capitalize">
                              Status: {invite.status}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded border border-transparent hover:border-red-500/10 transition-colors cursor-pointer text-xs flex items-center gap-1 font-medium"
                          title="Revoke invitation"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

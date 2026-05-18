import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Flag, Calendar, Activity, AlertTriangle } from 'lucide-react'
import { StorageUsage } from '@/components/admin/storage-usage'
import { HealthMonitor } from '@/components/admin/health-monitor'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    { count: organizersCount },
    { count: activeOrganizersCount },
    { count: eventsCount },
    { count: registrationsCount },
    { count: expiringSoonCount },
    { data: recentAuditLogs },
    { data: expiringOrganizers },
  ] = await Promise.all([
    supabase.from('organizers').select('id', { count: 'exact', head: true }),
    supabase
      .from('organizers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('registrations').select('id', { count: 'exact', head: true }),
    supabase
      .from('organizers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('sub_expires_at', 'is', null)
      .lte('sub_expires_at', sevenDaysFromNow.toISOString())
      .gt('sub_expires_at', now.toISOString()),
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('organizers')
      .select('name, slug, sub_expires_at')
      .eq('is_active', true)
      .not('sub_expires_at', 'is', null)
      .lte('sub_expires_at', sevenDaysFromNow.toISOString())
      .gt('sub_expires_at', now.toISOString())
      .limit(5),
  ])

  const stats = [
    {
      title: 'Total Organizers',
      value: organizersCount || 0,
      description: 'All event organizers',
      icon: Users,
    },
    {
      title: 'Active Tenants',
      value: activeOrganizersCount || 0,
      description: 'Currently active organizers',
      icon: Activity,
    },
    {
      title: 'Total Events',
      value: eventsCount || 0,
      description: 'All created events',
      icon: Flag,
    },
    {
      title: 'Total Registrations',
      value: registrationsCount || 0,
      description: 'Runner registrations',
      icon: Calendar,
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of the Pelikat platform</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(expiringSoonCount || 0) > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Subscriptions Expiring Soon
            </CardTitle>
            <CardDescription>
              {expiringSoonCount} organizer(s) with subscriptions expiring within 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringOrganizers?.map((org) => (
                <div
                  key={org.slug}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-sm text-muted-foreground">@{org.slug}</p>
                  </div>
                  <Badge variant="secondary">
                    Expires {new Date(org.sub_expires_at).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <StorageUsage />
        <HealthMonitor />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest audit log entries</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAuditLogs && recentAuditLogs.length > 0 ? (
              <div className="space-y-4">
                {recentAuditLogs.map((log) => (
                  <div key={log.id} className="flex items-center">
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common admin tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/admin/organizers"
              className="flex items-center rounded-lg p-2 hover:bg-secondary transition-colors"
            >
              <Users className="mr-2 h-4 w-4" />
              <span className="text-sm">Manage Organizers</span>
            </a>
            <a
              href="/admin/audit-logs"
              className="flex items-center rounded-lg p-2 hover:bg-secondary transition-colors"
            >
              <Activity className="mr-2 h-4 w-4" />
              <span className="text-sm">View Audit Logs</span>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
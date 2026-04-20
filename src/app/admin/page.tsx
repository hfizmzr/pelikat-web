import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Flag, Calendar, Activity } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [{ data: organizers }, { data: events }, { data: registrations }, { data: recentAuditLogs }] = await Promise.all([
    supabase.from('organizers').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('registrations').select('id', { count: 'exact', head: true }),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(10)
  ])

  const stats = [
    {
      title: 'Total Organizers',
      value: organizers?.length || 0,
      description: 'Active event organizers',
      icon: Users,
    },
    {
      title: 'Total Events',
      value: events?.length || 0,
      description: 'All created events',
      icon: Flag,
    },
    {
      title: 'Total Registrations',
      value: registrations?.length || 0,
      description: 'Runner registrations',
      icon: Calendar,
    },
    {
      title: 'Active Events',
      value: events?.length || 0,
      description: 'Currently active events',
      icon: Activity,
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
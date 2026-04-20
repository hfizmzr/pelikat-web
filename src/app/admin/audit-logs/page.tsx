import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function AdminAuditLogsPage() {
  const supabase = await createClient()

  const { data: auditLogs } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">Track platform activities and events</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent activities across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs && auditLogs.length > 0 ? (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Timestamp</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Actor</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Action</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Target</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-4 align-middle">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-4 align-middle">
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.actor_id?.slice(0, 8) || 'System'}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle">
                        <span className="font-medium">{log.action}</span>
                      </td>
                      <td className="p-4 align-middle">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {log.target_id?.slice(0, 8) || '-'}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle">
                        <span className="text-muted-foreground text-xs">
                          {log.metadata ? JSON.stringify(log.metadata).slice(0, 50) : '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No audit logs yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
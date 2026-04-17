export default async function OrganizerCheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Check-in Terminal - Event {id}</h1>
      <p className="mt-4 text-slate-600">Scan QR code here or upload participant photo.</p>
      
      <div className="mt-8 p-12 border-2 border-dashed rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
        Camera / Scanner UI will be mounted here
      </div>
    </div>
  )
}

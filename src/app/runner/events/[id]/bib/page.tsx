import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function BibPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return (
    <div className="pt-8 pb-24 md:pb-8 px-4 max-w-md mx-auto space-y-6 flex flex-col items-center">
      <div className="w-full">
         <Link href="/runner" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
             <ArrowLeft className="w-4 h-4" /> Back to Dashboard
         </Link>
      </div>

      <div className="bg-primary text-primary-foreground p-8 rounded-t-3xl w-full text-center">
         <h1 className="text-5xl font-black italic tracking-tighter drop-shadow-md">BIB #4829</h1>
         <p className="text-sm uppercase font-bold tracking-widest mt-2 opacity-80">10KM Open Category</p>
         <p className="text-xs opacity-60 mt-1">Event: {id}</p>
      </div>
      
      <div className="bg-card border border-border mt-0 p-8 rounded-b-3xl w-full shadow-xl flex flex-col items-center">
         <div className="w-64 h-64 bg-white p-4 rounded-xl flex items-center justify-center mx-auto border-4 border-muted">
            <div className="text-center text-muted-foreground text-xs p-10 border-2 border-dashed border-gray-300 w-full h-full flex flex-col items-center justify-center">
                <span>DUMMY QR SPACE</span>
                <span className="mt-2 text-[10px]">Use react-qr-code here</span>
            </div>
         </div>
         <p className="text-center mt-6 text-sm text-muted-foreground">
             Present this QR code at the REPC counter to collect your physical race pack.
         </p>
      </div>
    </div>
  );
}

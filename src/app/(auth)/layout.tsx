export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-dvh bg-background items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}

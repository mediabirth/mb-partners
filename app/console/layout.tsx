export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // Minimal passthrough — individual pages manage their own ConsoleNav + content.
  // The PageTransition is applied within each page via the shared wrapper below.
  return <>{children}</>
}

export function SplashScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-7 bg-background">
      <img src="/riaerp/logo.png" alt="RIA" className="h-auto w-40 sm:w-48" />
      <p className="flex items-center gap-1 text-sm tracking-wide text-muted-foreground">
        Loading
        <span className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="inline-block h-1 w-1 rounded-full bg-muted-foreground [animation:splash-dot_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.16 - 0.32}s` }}
            />
          ))}
        </span>
      </p>
      <style>{`
        @keyframes splash-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

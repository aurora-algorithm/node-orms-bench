// Profiling only: exit normally on Ctrl-C so node --cpu-prof writes its file.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => process.exit(0));
}

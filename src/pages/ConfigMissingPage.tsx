export function ConfigMissingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 p-6">
      <h1 className="text-xl font-semibold">Supabase isn’t configured</h1>
      <p className="text-sm text-muted-foreground">
        Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>
        {" "}(Supabase Dashboard → Project Settings → API). Never use the service-role key here. Then restart the dev server.
      </p>
    </main>
  );
}

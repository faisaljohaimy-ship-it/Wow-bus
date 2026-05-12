import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Saudi Energy Transportation
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Welcome. The application shell is up and running.
        </p>
      </div>
    </main>
  );
}

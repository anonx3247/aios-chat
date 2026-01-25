export default function App() {
  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100">
      <aside className="w-64 border-r border-zinc-800 p-4">
        <h2 className="text-lg font-semibold mb-4">Chat History</h2>
        <p className="text-zinc-500 text-sm">No conversations yet</p>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="border-b border-zinc-800 p-4">
          <h1 className="text-xl font-semibold">AIOS Chat</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500">Start a new conversation</p>
        </div>
      </main>
    </div>
  );
}

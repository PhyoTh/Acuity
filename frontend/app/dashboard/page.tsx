"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import CreateRoomForm from "@/components/CreateRoomForm";
import { api } from "@/lib/api";
import type { RoomConfig, RoomSummary } from "@/lib/types";

export default function DashboardHome() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [created, setCreated] = useState<RoomConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRooms()
      .then(setRooms)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load rooms"));
  }, []);

  function onCreated(room: RoomConfig) {
    setCreated(room);
    setRooms((prev) => [
      {
        id: room.id,
        join_code: room.join_code,
        title: room.title,
        language: room.language,
        status: room.status,
        created_at: room.created_at,
      },
      ...prev,
    ]);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Recruiter dashboard</h1>
      <CreateRoomForm onCreated={onCreated} />
      {created && (
        <div className="rounded border border-green-800 bg-green-950/40 p-4 text-sm">
          Room created. Share this candidate invite link:
          <code className="mt-1 block break-all text-green-300">
            {origin}/join/{created.join_code}
          </code>
        </div>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Your rooms</h2>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border border-neutral-800 p-3 text-sm"
            >
              <div>
                <Link href={`/dashboard/${r.id}`} className="font-medium underline">
                  {r.title}
                </Link>
                <span className="ml-2 text-neutral-500">
                  {r.language} · {r.status}
                </span>
              </div>
              <code className="text-neutral-400">{r.join_code}</code>
            </li>
          ))}
          {rooms.length === 0 && !error && (
            <p className="text-sm text-neutral-500">No rooms yet — create one above.</p>
          )}
        </ul>
      </section>
    </main>
  );
}

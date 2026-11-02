"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Workspace from "@/components/workspace";
import { loadApprovedLesson } from "@/practice/load-approved-lesson";
import {
  listApprovedProcedures,
  saveApprovedProcedure,
  type SavedProcedure,
} from "@/teach/approved-storage";
import LocalPractice from "./local-practice";

/** Mount the existing room only after a lesson has been selected. */
export default function PracticeEntry({
  lessonId,
  rehearsal,
}: {
  lessonId?: string;
  rehearsal?: string;
}) {
  const router = useRouter();
  const [library, setLibrary] = useState<SavedProcedure[] | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const handoff = sessionStorage.getItem("steplint-approved-handoff");
        if (!lessonId && handoff) {
          const lesson = loadApprovedLesson(handoff);
          await saveApprovedProcedure(handoff);
          if (!active) return;
          sessionStorage.removeItem("steplint-approved-handoff");
          router.replace(
            `/practice?lesson=${encodeURIComponent(lesson.procedure.id)}`,
          );
          return;
        }
        const rows = await listApprovedProcedures();
        if (!active) return;
        setLibrary(rows.sort((a, b) => b.savedAt - a.savedAt));
        setError("");
        if (lessonId) {
          const selected = rows.find((row) => row.id === lessonId);
          if (!selected)
            throw Error(
              "This lesson is not saved in this browser. Choose an available lesson.",
            );
          loadApprovedLesson(selected.raw);
          setReadyId(lessonId);
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load lessons.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [lessonId, router]);

  if (rehearsal === "1" || (lessonId && readyId === lessonId))
    return <LocalPractice key={lessonId ?? "rehearsal"} />;

  return (
    <Workspace mode="practice">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Choose a lesson</h1>
        <p className="text-slate-600">
          Select a reviewed Teach lesson to enter the practice room.
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {!library && !error && <p>Loading lessons…</p>}
        {library?.length === 0 && (
          <p>
            No approved lessons are saved in this browser yet.{" "}
            <Link href="/teach" className="underline">
              Go to Teach
            </Link>{" "}
            to create and approve one.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {library?.map((row) => (
            <article
              key={row.id}
              className="space-y-2 rounded-2xl border bg-white p-5"
            >
              <h2 className="text-lg font-bold">{row.title}</h2>
              <Link
                className="primary inline-block"
                href={`/practice?lesson=${encodeURIComponent(row.id)}`}
              >
                Practice
              </Link>
            </article>
          ))}
        </div>
      </div>
    </Workspace>
  );
}

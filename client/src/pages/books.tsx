/**
 * /books — "My books": every non-deleted project the signed-in user owns.
 *
 * Guests see their in-progress drafts too (a guest session owns them);
 * the page nudges them to sign in so the list survives a cleared
 * browser. Resume opens the builder with ?project=<id>, which makes the
 * builder pull the server document instead of the local draft
 * (features/builder/sync.ts).
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/features/account/AppShell";
import { useSession } from "@/features/auth/useSession";
import { SignInSheet } from "@/features/auth/SignInSheet";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  occasion: string | null;
  themeKey: string | null;
  coverUrl: string | null;
  photoCount: number;
  updatedAt: string;
  createdAt: string;
}

const PROJECTS_KEY = ["/api/projects"] as const;

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function BooksPage() {
  const { loading, isGuest, user } = useSession();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sheet, setSheet] = useState(false);

  const books = useQuery<ProjectSummary[]>({
    queryKey: PROJECTS_KEY,
    // no session at all → 401 → treat as empty rather than an error page
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !loading,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      toast({ title: "Book deleted" });
    },
    onError: () => toast({ title: "Couldn't delete that book", variant: "destructive" }),
  });

  const list = books.data ?? [];

  return (
    <AppShell>
      <div className="au-page">
        <div className="au-page-head">
          <div>
            <div className="bb-kicker">Your library</div>
            <h1>My books</h1>
            <p className="au-page-sub">
              {isGuest
                ? "Drafts live in this browser until you sign in."
                : `Signed in as ${user?.email}. Your books are saved on every device.`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {isGuest && list.length > 0 ? (
              <button className="bb-btn bb-btn-secondary" onClick={() => setSheet(true)}>
                Save to account
              </button>
            ) : null}
            <Link href="/wizard" className="bb-btn bb-btn-primary">
              <Plus size={16} /> New book
            </Link>
          </div>
        </div>

        {books.isLoading || loading ? (
          <div className="au-grid" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="au-card" style={{ opacity: 0.5 }}>
                <div className="au-card-cover" />
                <div className="au-card-body" style={{ height: 76 }} />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="au-empty">
            <Sparkles size={28} />
            <h2>No books yet</h2>
            <p style={{ margin: 0 }}>Answer three questions, drop in your photos, and we design the rest.</p>
            <Link href="/wizard" className="bb-btn bb-btn-primary bb-btn-lg">
              Start your first book
            </Link>
          </div>
        ) : (
          <div className="au-grid">
            {list.map((b) => (
              <div key={b.id} className="au-card">
                <Link href={`/wizard?project=${b.id}`} className="au-card-cover" aria-label={`Open ${b.name}`}>
                  {b.coverUrl ? (
                    <img src={b.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="ph">
                      <BookOpen size={28} />
                    </span>
                  )}
                </Link>
                <div className="au-card-body">
                  <span className={"au-badge " + (b.status === "draft" ? "draft" : "")}>{b.status}</span>
                  <div className="au-card-title">{b.name}</div>
                  <div className="au-card-meta">
                    {b.occasion ? `${b.occasion} · ` : ""}
                    {b.photoCount} photo{b.photoCount === 1 ? "" : "s"} · edited {relative(b.updatedAt)}
                  </div>
                  <div className="au-card-actions">
                    <button className="bb-btn bb-btn-ghost" onClick={() => navigate(`/wizard?project=${b.id}`)}>
                      <BookOpen size={14} /> Open
                    </button>
                    <button
                      className="bb-btn bb-btn-ghost au-danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete "${b.name}"? This can't be undone.`)) remove.mutate(b.id);
                      }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {sheet ? <SignInSheet intent="save" onClose={() => setSheet(false)} callbackURL="/books" /> : null}
    </AppShell>
  );
}

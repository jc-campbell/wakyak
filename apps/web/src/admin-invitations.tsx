import type { InvitationDto } from "@wakyak/contracts";
import {
  useInfiniteQuery,
  useMutation,
  type InfiniteData,
} from "@tanstack/react-query";
import { Check, Copy, KeyRound, LoaderCircle, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/presentation";
import { queryClient } from "@/lib/query-client";
import { invitationsQuery, keys } from "@/lib/queries";
import { EmptyState, ErrorState, LoadingRows, ScreenHeader } from "@/wired-app";

type InvitationPage = Awaited<ReturnType<typeof api.invitations>>;

const statusStyle: Record<InvitationDto["status"], string> = {
  ACTIVE: "bg-teal-50 text-teal-700",
  USED: "bg-stone-100 text-stone-600",
  REVOKED: "bg-red-50 text-red-700",
  EXPIRED: "bg-amber-50 text-amber-700",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminInvitationsScreen() {
  const invitations = useInfiniteQuery(invitationsQuery);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<InvitationDto>();
  const [copiedId, setCopiedId] = useState<string>();
  const [confirmRevokeId, setConfirmRevokeId] = useState<string>();
  const [localError, setLocalError] = useState<string>();

  useEffect(() => {
    if (!copiedId) return;
    const timeout = window.setTimeout(() => setCopiedId(undefined), 2_000);
    return () => clearTimeout(timeout);
  }, [copiedId]);

  const createInvitation = useMutation({
    mutationFn: api.createInvitation,
    onSuccess: async (value) => {
      setCreated(value);
      setLabel("");
      setLocalError(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.invitations });
    },
    onError: (error) => setLocalError(errorMessage(error)),
  });

  const revokeInvitation = useMutation({
    mutationFn: api.revokeInvitation,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.invitations });
      const previous = queryClient.getQueryData<
        InfiniteData<InvitationPage, string | null>
      >(keys.invitations);
      queryClient.setQueryData<InfiniteData<InvitationPage, string | null>>(
        keys.invitations,
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  invitations: page.invitations.map((invitation) =>
                    invitation.id === id
                      ? {
                          ...invitation,
                          status: "REVOKED" as const,
                          revokedAt: new Date().toISOString(),
                        }
                      : invitation,
                  ),
                })),
              }
            : current,
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      queryClient.setQueryData(keys.invitations, context?.previous);
      setLocalError(errorMessage(error));
    },
    onSettled: async () => {
      setConfirmRevokeId(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.invitations });
    },
  });

  const copyCode = async (invitation: InvitationDto) => {
    try {
      await navigator.clipboard.writeText(invitation.code);
      setCopiedId(invitation.id);
      setLocalError(undefined);
    } catch {
      setLocalError("The invitation code could not be copied.");
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createInvitation.mutate(label.trim() || undefined);
  };

  const rows = invitations.data?.pages.flatMap((page) => page.invitations);

  return (
    <section>
      <ScreenHeader
        title="Invitations"
        subtitle="Owner-only · single-use codes"
        back={() => history.back()}
      />

      <div className="border-b border-stone-200 px-4 py-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Create an invitation</h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Codes expire after 30 days and can create one account.
            </p>
          </div>
        </div>
        <form className="mt-4 flex gap-2 max-sm:flex-col" onSubmit={submit}>
          <input
            aria-label="Invitation label"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm placeholder:text-stone-400"
            maxLength={80}
            placeholder="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button
            disabled={createInvitation.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {createInvitation.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            Create code
          </button>
        </form>
        {created ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3">
            <div className="min-w-0 flex-1">
              <small className="block text-[.62rem] font-bold uppercase tracking-wide text-teal-700">
                Ready to share
              </small>
              <code className="mt-1 block truncate text-sm font-bold tracking-wide text-stone-950">
                {created.code}
              </code>
            </div>
            <button
              aria-label="Copy new invitation code"
              className="grid size-9 place-items-center rounded-lg bg-white text-teal-700 shadow-sm"
              onClick={() => void copyCode(created)}
              type="button"
            >
              {copiedId === created.id ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
            <button
              aria-label="Dismiss new invitation"
              className="grid size-9 place-items-center rounded-lg text-stone-500"
              onClick={() => setCreated(undefined)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        {localError ? (
          <p
            className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"
            role="alert"
          >
            {localError}
          </p>
        ) : null}
      </div>

      <header className="flex items-end justify-between px-4 pb-3 pt-5">
        <div>
          <h2 className="text-sm font-bold">Invitation history</h2>
          <p className="mt-1 text-[.68rem] text-stone-500">
            Active, used, expired, and revoked codes.
          </p>
        </div>
      </header>

      {invitations.isLoading ? <LoadingRows /> : null}
      {invitations.isError ? (
        <ErrorState
          error={invitations.error}
          retry={() => void invitations.refetch()}
        />
      ) : null}
      {rows?.length === 0 ? (
        <EmptyState
          title="No invitations yet"
          detail="Create the first single-use invitation above."
        />
      ) : null}
      {rows?.length ? (
        <div className="divide-y divide-stone-200 border-t border-stone-200">
          {rows.map((invitation) => (
            <article
              className="px-4 py-4 motion-safe:animate-[row-enter_200ms_ease-out_both]"
              key={invitation.id}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="truncate text-xs font-bold tracking-wide">
                      {invitation.code}
                    </code>
                    <span
                      className={`rounded-full px-2 py-1 text-[.58rem] font-bold ${statusStyle[invitation.status]}`}
                    >
                      {invitation.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">
                    {invitation.label ?? "Unlabeled invitation"}
                  </p>
                  <p className="mt-2 text-[.62rem] leading-relaxed text-stone-400">
                    Created {formatDate(invitation.createdAt)} · Expires{" "}
                    {formatDate(invitation.expiresAt)}
                    {invitation.consumedAt
                      ? ` · Used ${formatDate(invitation.consumedAt)}`
                      : ""}
                    {invitation.revokedAt
                      ? ` · Revoked ${formatDate(invitation.revokedAt)}`
                      : ""}
                  </p>
                </div>
                <button
                  aria-label={`Copy invitation ${invitation.code}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-500"
                  onClick={() => void copyCode(invitation)}
                >
                  {copiedId === invitation.id ? (
                    <Check className="size-4 text-teal-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
              {invitation.status === "ACTIVE" ? (
                <div className="mt-3 flex justify-end gap-2">
                  {confirmRevokeId === invitation.id ? (
                    <>
                      <button
                        className="rounded-lg px-3 py-2 text-[.65rem] font-bold text-stone-500"
                        onClick={() => setConfirmRevokeId(undefined)}
                      >
                        Cancel
                      </button>
                      <button
                        disabled={revokeInvitation.isPending}
                        className="rounded-lg bg-red-600 px-3 py-2 text-[.65rem] font-bold text-white disabled:opacity-50"
                        onClick={() => revokeInvitation.mutate(invitation.id)}
                      >
                        Confirm revoke
                      </button>
                    </>
                  ) : (
                    <button
                      className="rounded-lg border border-stone-200 px-3 py-2 text-[.65rem] font-bold text-stone-600"
                      onClick={() => setConfirmRevokeId(invitation.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {invitations.hasNextPage ? (
        <div className="border-t border-stone-200 p-4 text-center">
          <button
            disabled={invitations.isFetchingNextPage}
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold disabled:opacity-50"
            onClick={() => void invitations.fetchNextPage()}
          >
            {invitations.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

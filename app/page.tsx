"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/auth-context";
import { PinPad } from "@/components/app/pin-pad";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The PIN is the only credential, and the only thing on this screen.
 *
 * Entered once a day per device; after that the desk goes straight through to
 * the daily sheet.
 */
export default function LoginPage() {
  const { staff, loading, locked, unlock } = useAuth();
  const router = useRouter();
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !locked) router.replace("/kunlik");
  }, [loading, locked, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-xs">
        {loading ? (
          <LoginSkeleton />
        ) : (
          <>
            <div className="mb-8 space-y-1.5 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Xush kelibsiz
              </h1>
              <p className="text-sm text-muted-foreground">
                PIN kodni kiriting
              </p>
            </div>

            <PinPad
              error={pinError}
              onErrorClear={() => setPinError(null)}
              onSubmit={async (pin) => {
                const result = await unlock(pin);
                if (result.ok) router.replace("/kunlik");
                else setPinError(result.reason);
                return result.ok;
              }}
            />

            {staff ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {staff.email}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="space-y-8">
      <div className="mx-auto space-y-2 text-center">
        <Skeleton className="mx-auto h-7 w-40" />
        <Skeleton className="mx-auto h-4 w-32" />
      </div>
      <div className="flex justify-center gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="size-3 rounded-full" />
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-[15rem] grid-cols-3 gap-2.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

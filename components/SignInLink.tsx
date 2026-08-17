"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { loginHrefForReturnTo } from "@/lib/auth-return";

type SignInLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  returnTo?: string;
};

export function SignInLink({ returnTo, ...props }: SignInLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const currentPath = `${pathname}${query ? `?${query}` : ""}`;

  return <Link {...props} href={loginHrefForReturnTo(returnTo ?? currentPath) as never} />;
}

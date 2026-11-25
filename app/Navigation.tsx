
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  role: "owner" | "chief" | "manager" | "employee";
};

export default function Navigation({ role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingColorCount, setPendingColorCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const links = [
  { href: "/inventory", label: "Inventory" },
  { href: "/inventory/receive", label: "Stock Management" },
  { href: "/inventory/pending-colors", label: "Pending Color Confirmation" },
  { href: "/inventory/hike-review", label: "Hike Sales Review" },
  { href: "/terms", label: "Terms and Conditions" },
];

  if (
    role === "owner" ||
    role === "chief" ||
    role === "manager"
  ) {
    links.push(
      { href: "/inventory/manage", label: "Shoe Catalog" },
      { href: "/inventory/variants", label: "Product Variants" },
      { href: "/inventory/correct", label: "Corrections" },
      { href: "/employees", label: "Employees" }
    );
  }

  if (role === "owner") {
    links.push(
      { href: "/admin/activity", label: "Activity Log" },
      { href: "/integration-test", label: "Hike Integration" },
      { href: "/admin/locally", label: "Locally Integration" }
    );
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setPendingColorCount(0);
    void fetch("/api/hike/pending-colors?count=1", {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const { count } = await response.json();
      if (!controller.signal.aborted && Number.isSafeInteger(count)) {
        setPendingColorCount(count);
      }
    }).catch(() => {});

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Sign out failed");
      }

      setOpen(false);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <nav className="feldryva-navigation"
      style={{
        background: "var(--nav-blue)",
        borderBottom: "1px solid #315b80",
        padding: "14px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        position: "relative",
        zIndex: 100,
      }}
    >
      <Link
        href="/inventory"
        style={{
          color: "#ffffff",
          fontSize: 19,
          fontWeight: 750,
          letterSpacing: "-0.5px",
          textDecoration: "none",
          overflowWrap: "anywhere",
        }}
      >
        Feldryva - Sneaker Factory
      </Link>

      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="main-navigation-menu"
          onClick={() => setOpen((previous) => !previous)}
          style={{
            background: open ? "var(--action-blue)" : "transparent",
            border: "1px solid #475569",
            borderRadius: 8,
            color: "white",
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: 23,
            lineHeight: 1,
          }}
        >
          ☰
        </button>

        {open && (
          <div
            id="main-navigation-menu"
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: 240,
              maxWidth: "calc(100vw - 40px)",
              background: "var(--nav-blue)",
              border: "1px solid #334155",
              borderRadius: 10,
              padding: 8,
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              maxHeight: "75vh",
              overflowY: "auto",
            }}
          >
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/inventory" &&
                  pathname.startsWith(link.href + "/"));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "block",
                    padding: "12px 14px",
                    borderRadius: 7,
                    color: active ? "#ffffff" : "#d8e8f8",
                    background: active
                      ? "var(--action-blue)"
                      : "transparent",
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    textDecoration: "none",
                    marginBottom: 2,
                  }}
                >
                  {link.label}
                  {link.href === "/inventory/pending-colors" && pendingColorCount > 0 && (
                    <span
                      aria-label={`${pendingColorCount} sales awaiting color confirmation`}
                      style={{
                        marginLeft: 8,
                        padding: "2px 7px",
                        borderRadius: 12,
                        background: "#b91c1c",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pendingColorCount}
                    </span>
                  )}
                </Link>
              );
            })}

            <div
              style={{
                borderTop: "1px solid #334155",
                margin: "8px 0",
              }}
            />

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 14px",
                border: "none",
                borderRadius: 7,
                background: "transparent",
                color: "#fca5a5",
                textAlign: "left",
                fontSize: 14,
                fontWeight: 600,
                cursor: signingOut ? "wait" : "pointer",
              }}
            >
              {signingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

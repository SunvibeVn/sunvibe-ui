import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { isOwnerIntakeEnabled, OwnerIntakeForm } from "@/features/owner-intake";

// Unreachable until the staff queue UI exists and the consent text passed legal review (BR-15, C-7, Q-11).
// Written out literally so Next inlines the value at build time.
const enabled = isOwnerIntakeEnabled(process.env.NEXT_PUBLIC_OWNER_INTAKE_ENABLED);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OwnerIntake.page");
  // No navigation link points here and the page is not indexed (BR-14).
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function ListWithUsPage() {
  if (!enabled) notFound();
  const t = await getTranslations("OwnerIntake");

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{t("page.title")}</h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">{t("page.intro")}</p>
      <p className="mt-2 text-base leading-relaxed text-slate-600">{t("page.expectation")}</p>
      <div className="mt-6">
        <Alert>{t("serviceArea")}</Alert>
      </div>
      <p className="mt-8 text-sm text-slate-500">{t("page.requiredHint")}</p>
      <div className="mt-4">
        <OwnerIntakeForm />
      </div>
    </section>
  );
}

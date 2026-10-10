import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { requireUser } from "../session/dal";
import { VerifyPhoneForm } from "./verify-phone-form";

/** Reads the session, so render it inside <Suspense>. */
export async function VerifyPhoneSection() {
  const user = await requireUser(AUTH_ROUTES.verifyPhone);
  if (user.phoneVerified) redirect(AUTH_ROUTES.account);
  const maskedPhone = user.phoneNumber.replace(/\d(?=\d{3})/g, "•");
  return <VerifyPhoneForm maskedPhone={maskedPhone} />;
}

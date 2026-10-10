import { LogOutIcon } from "@/components/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { logoutAction } from "../actions/logout.action";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton variant="secondary" fullWidth={false}>
        <LogOutIcon size={16} />
        Log out
      </SubmitButton>
    </form>
  );
}

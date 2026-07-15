import { AuthPanel } from "@/components/auth-panel";

export function SignInView() {
  return (
    <section className="form-page">
      <AuthPanel mode="sign-in" />
    </section>
  );
}

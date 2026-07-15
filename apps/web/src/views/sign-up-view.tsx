import { AuthPanel } from "@/components/auth-panel";

export function SignUpView() {
  return (
    <section className="form-page">
      <AuthPanel mode="sign-up" />
    </section>
  );
}

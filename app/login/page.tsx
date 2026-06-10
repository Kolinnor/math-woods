import { loginAction, registerAction } from "@/lib/actions/auth-actions";

export default function LoginPage() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
      <section>
        <h1 className="mb-2 text-2xl font-bold">Sign in</h1>
        <p className="muted mb-5">Use your username or email.</p>
        <form action={loginAction} className="panel grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Username or email</span>
            <input name="identifier" placeholder="you@example.com" required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Password</span>
            <input name="password" type="password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-2xl font-bold">Create account</h2>
        <p className="muted mb-5">Create a Math Woods account with email and password.</p>
        <form action={registerAction} className="panel grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Username</span>
            <input name="username" placeholder="noether" minLength={3} required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Email</span>
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Password</span>
            <input name="password" type="password" minLength={8} required />
          </label>
          <button type="submit">Create account</button>
        </form>
      </section>
    </div>
  );
}

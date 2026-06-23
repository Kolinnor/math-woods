import { loginAction, registerAction } from "@/lib/actions/auth-actions";
import { MATH_LEVEL_HELP_TEXT, MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/user-display";

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
        <p className="muted mb-5">Create an account to solve, discuss, and contribute problems.</p>
        <form action={registerAction} className="panel grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Profile name</span>
            <input name="displayName" placeholder="Emmy Noether" minLength={2} maxLength={DISPLAY_NAME_MAX_LENGTH} required />
            <small className="muted">
              This is the name other people will see. It can contain spaces.
            </small>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Email</span>
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Password</span>
            <input name="password" type="password" minLength={8} required />
          </label>
          <label className="grid gap-2">
            <span className="field-label-with-help text-sm font-medium">
              What is your level in mathematics?
              <span className="help-link" tabIndex={0} title={MATH_LEVEL_HELP_TEXT} aria-label={MATH_LEVEL_HELP_TEXT}>
                ?
              </span>
            </span>
            <select name="mathLevel" required defaultValue="">
              <option value="" disabled>
                Choose a level
              </option>
              {MATH_LEVEL_OPTIONS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label} ({level.range})
                </option>
              ))}
            </select>
            <small className="muted">
              This matches the site difficulty scale, from 1 to 100, and can be changed later.
            </small>
          </label>
          <button type="submit">Create account</button>
        </form>
      </section>
    </div>
  );
}

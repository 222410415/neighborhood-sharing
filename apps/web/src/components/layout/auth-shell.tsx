export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      <div className="auth-art" aria-hidden="true">
        <div className="auth-art-copy">
          <h2>Good things happen close to home.</h2>
          <p>
            Share what you have. Find what you need. Make more of your
            neighborhood.
          </p>
        </div>
      </div>
      <div className="auth-form reveal">
        <h1>{title}</h1>
        <p className="auth-form-intro">{intro}</p>
        {children}
      </div>
    </div>
  );
}

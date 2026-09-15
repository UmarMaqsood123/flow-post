import type { ReactNode } from "react";

function AuthCardHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
    </div>
  );
}

export default AuthCardHeader;

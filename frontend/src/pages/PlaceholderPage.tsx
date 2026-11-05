import { Link } from "react-router-dom";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <article className="panel empty">
        <p>This section is being built.</p>
        <Link to="/" className="link">Back to dashboard</Link>
      </article>
    </div>
  );
}

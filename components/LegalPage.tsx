import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "../lib/site";

/** Moldura das páginas de texto (termos, privacidade, apoio). */
export default function LegalPage({ title, updated = true, children }: { title: string; updated?: boolean; children: ReactNode }) {
  return <main className="legal">
    <Link href="/">← Voltar para a busca</Link>
    <h1>{title}</h1>
    {updated && <p className="legal-updated">Última atualização: {SITE.legalUpdatedAt}</p>}
    {children}
    <nav className="legal-nav" aria-label="Documentos">
      <Link href="/termos">Termos de uso</Link>
      <Link href="/privacidade">Privacidade</Link>
      <Link href="/apoiar">Apoiar o desenvolvedor</Link>
    </nav>
    <p className="legal-independence">{SITE.independence}</p>
  </main>;
}

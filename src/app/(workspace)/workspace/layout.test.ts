import { NextIntlClientProvider } from "next-intl";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { englishSessionTexts } from "@/features/auth/client";
import { WorkspaceShell } from "@/features/workspace";
import en from "@/i18n/messages/en.json";
import WorkspaceLayout, { metadata } from "./layout";

type Props = { children?: ReactNode; [key: string]: unknown };

function element(node: unknown): ReactElement<Props> {
  if (!isValidElement<Props>(node)) throw new Error("not a React element");
  return node;
}

describe("workspace layout: English subtree (W14-23, spec 5.1)", () => {
  const page = "page";
  const root = element(WorkspaceLayout({ children: page, params: Promise.resolve({}) } as LayoutProps<"/workspace">));

  it("wraps the workspace in lang=en", () => {
    expect(root.type).toBe("div");
    expect(root.props.lang).toBe("en");
  });

  it("serves the en.json messages in Vietnam time around the shell", () => {
    const provider = element(root.props.children);
    expect(provider.type).toBe(NextIntlClientProvider);
    expect(provider.props.locale).toBe("en");
    expect(provider.props.messages).toBe(en);
    expect(provider.props.timeZone).toBe("Asia/Ho_Chi_Minh");
    const shell = element(provider.props.children);
    expect(shell.type).toBe(WorkspaceShell);
    expect(shell.props.children).toBe(page);
  });

  it("has the generic English title", () => {
    expect(metadata.title).toBe("Workspace");
  });
});

describe("WorkspaceShell session screens (W14-20, Review Focus 4)", () => {
  it("gives RequireSession the English session texts", () => {
    const session = element(WorkspaceShell({ children: "page" }));
    expect(session.props.texts).toBe(englishSessionTexts);
  });
});

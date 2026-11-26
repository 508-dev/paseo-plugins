import { useTranslation } from "@getpaseo/plugin/client";
import { messages } from "./messages";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import {
  directActions,
  permissionDetails,
  permissionSummary,
  questionPreview,
  type InboxCard,
  type InboxKind,
  type PermissionAction,
} from "./inbox-model";
import { InboxButton } from "./inbox-controls";
import type { ApprovalState } from "./inbox-approvals";
import { useInboxProgress } from "./use-inbox";

const kinds: Record<
  InboxKind,
  { icon: string; action: "answer" | "openAgent" | "inspect" | "reviewWork" }
> = {
  question: { icon: "MessageCircle", action: "answer" },
  approval: { icon: "ShieldCheck", action: "openAgent" },
  attention: { icon: "MessageCircle", action: "openAgent" },
  failed: { icon: "CircleAlert", action: "inspect" },
  review: { icon: "CheckCheck", action: "reviewWork" },
};

export function InboxRow({
  card,
  theme,
  compact,
  tapToOpen,
  unread,
  readDisabled,
  onToggleRead,
  onOpen,
  approval,
  onRespond,
}: {
  card: InboxCard;
  theme: PluginTheme;
  compact: boolean;
  tapToOpen: boolean;
  unread: boolean | null;
  readDisabled: boolean;
  onToggleRead(): void;
  onOpen?: () => void;
  approval?: ApprovalState;
  onRespond(action: PermissionAction): void;
}) {
  const { t, locale } = useTranslation(messages);
  const [expanded, setExpanded] = useState(false);
  const pending = approval?.pending ?? null;
  const error = approval?.error;
  const progress = useInboxProgress(card);
  const kind = kinds[card.kind];
  const questions =
    card.permission && card.kind === "question" ? questionPreview(card.permission) : [];
  const actions = card.permission ? directActions(card.permission) : [];
  const inlineApproval = card.kind === "approval" && actions.length > 0;
  const openRow = tapToOpen ? onOpen : undefined;
  const foreground = { color: theme.colors.foreground, fontSize: 14, lineHeight: 20 };
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 };
  const updatedAt = new Date(card.updatedAt);
  const minutes = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 60_000));

  function age() {
    if (!Number.isFinite(minutes)) return "";
    if (minutes < 1) return t("now");
    if (minutes < 60) return t("minutesAgo", { count: minutes });
    if (minutes < 1440) return t("hoursAgo", { count: Math.floor(minutes / 60) });
    return t("daysAgo", { count: Math.floor(minutes / 1440) });
  }

  const content = (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Icon
          name={kind.icon}
          size={14}
          color={card.kind === "failed" ? theme.colors.statusDanger : theme.colors.foregroundMuted}
        />
        <Text style={muted}>{t(card.kind)}</Text>
        {unread ? (
          <Text style={{ color: theme.colors.accent, fontSize: 11 }}>{t("unread")}</Text>
        ) : null}
        <Text
          accessibilityLabel={
            Number.isFinite(minutes) ? updatedAt.toLocaleString(locale) : card.updatedAt
          }
          style={[muted, { marginLeft: "auto" }]}
        >
          {age()}
        </Text>
      </View>
      <Text style={[foreground, { fontWeight: unread ? "600" : "400" }]}>
        {card.workspaceName ?? card.agentTitle}
      </Text>
      {card.workspaceName && card.workspaceName !== card.agentTitle ? (
        <Text numberOfLines={1} style={muted}>
          {card.agentTitle}
        </Text>
      ) : null}
      <Text numberOfLines={2} style={muted}>
        {card.projectName} · {card.hostLabel}
      </Text>
      {card.kind === "question" && card.permission ? (
        <View style={{ gap: 6, paddingTop: 2 }}>
          <Text numberOfLines={3} style={foreground}>
            {questions[0]?.question ??
              card.permission.description ??
              card.permission.title ??
              t("agentQuestion")}
          </Text>
          {questions[0]?.options.length ? (
            <View style={{ gap: 4 }}>
              <Text style={muted}>
                {questions[0].multiSelect ? t("chooseMany") : t("chooseOne")} ·{" "}
                {t("options", { count: questions[0].options.length })}
              </Text>
              {questions[0].options.slice(0, 2).map((option, index) => (
                <Text key={index} numberOfLines={2} style={muted}>
                  • {option.label}
                  {option.description ? ` — ${option.description}` : ""}
                </Text>
              ))}
              {questions[0].options.length > 2 ? (
                <Text style={muted}>
                  {t("moreOptions", { count: questions[0].options.length - 2 })}
                </Text>
              ) : null}
            </View>
          ) : null}
          {questions.length > 1 ? (
            <Text style={muted}>{t("moreQuestions", { count: questions.length - 1 })}</Text>
          ) : null}
        </View>
      ) : null}
      {card.kind === "approval" && card.permission ? (
        <Text numberOfLines={expanded ? undefined : 2} selectable style={foreground}>
          {permissionSummary(card.permission) ?? t("reviewInAgent")}
        </Text>
      ) : null}
      {card.kind === "failed" && card.error ? (
        <Text numberOfLines={3} style={foreground}>
          {card.error}
        </Text>
      ) : null}
      {card.kind === "attention" ? <Text style={foreground}>{t("agentWaiting")}</Text> : null}
      {progress ? (
        <View
          style={{
            marginTop: 2,
            paddingLeft: 8,
            borderLeftWidth: 2,
            borderLeftColor: theme.colors.foregroundMuted,
          }}
        >
          <Text
            numberOfLines={2}
            style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 19 }}
          >
            <Text style={{ fontWeight: "600" }}>{t("latestUpdate")}</Text>
            {"  "}
            {progress}
          </Text>
        </View>
      ) : null}
    </>
  );
  const readAction = (
    <InboxButton
      theme={theme}
      compact={compact || Boolean(openRow)}
      disabled={readDisabled}
      label={unread ? t("markRead") : t("markUnread")}
      onPress={onToggleRead}
      icon={unread ? "MailOpen" : "Mail"}
      variant="outline"
    >
      {openRow ? undefined : unread ? t("markRead") : t("markUnread")}
    </InboxButton>
  );

  return (
    <View
      testID={`inbox-row-${card.agentId}`}
      style={{
        padding: openRow ? 0 : compact ? 12 : 14,
        gap: openRow ? 0 : 6,
        backgroundColor: unread ? theme.colors.surface1 : theme.colors.surface0,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      {openRow ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("openHint")}
            onPress={openRow}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              padding: 12,
              paddingRight: 64,
              backgroundColor: pressed ? theme.colors.surface2 : undefined,
            })}
          >
            <View style={{ flex: 1, gap: 6 }}>{content}</View>
            <Icon name="ChevronRight" size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
          >
            {readAction}
          </View>
        </View>
      ) : (
        content
      )}
      {!openRow || inlineApproval ? (
        <View style={{ gap: 6, ...(openRow ? { paddingHorizontal: 12, paddingBottom: 12 } : {}) }}>
          {expanded && card.permission && card.kind === "approval" ? (
            <Text
              selectable
              style={[
                muted,
                {
                  fontFamily: "monospace",
                  padding: 10,
                  backgroundColor: theme.colors.surface2,
                  borderRadius: 6,
                },
              ]}
            >
              {permissionDetails(card.permission).slice(0, 4000)}
            </Text>
          ) : null}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.statusDanger, fontSize: 12 }}
            >
              {"key" in error ? t(error.key) : t("responseError", { detail: error.detail })}
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
              paddingTop: 4,
            }}
          >
            {inlineApproval ? (
              <InboxButton
                theme={theme}
                compact={compact}
                variant={expanded ? "ghost" : "solid"}
                icon="ShieldCheck"
                onPress={() => setExpanded(!expanded)}
              >
                {expanded ? t("hideDetails") : t("reviewRequest")}
              </InboxButton>
            ) : null}
            {expanded
              ? actions.map((action) => (
                  <InboxButton
                    key={action.id}
                    theme={theme}
                    compact={compact}
                    disabled={pending !== null}
                    variant={action.behavior === "allow" ? "solid" : "outline"}
                    danger={action.behavior === "deny"}
                    icon={action.behavior === "allow" ? "Check" : "X"}
                    onPress={() => onRespond(action)}
                  >
                    {pending === action.id ? t("sending") : (action.label ?? t(action.behavior))}
                  </InboxButton>
                ))
              : null}
            {!openRow && onOpen ? (
              <InboxButton
                theme={theme}
                compact={compact}
                variant={inlineApproval ? "outline" : "solid"}
                icon={inlineApproval ? "ArrowUpRight" : kind.icon}
                onPress={onOpen}
              >
                {card.kind === "approval" && !inlineApproval ? t("reviewRequest") : t(kind.action)}
              </InboxButton>
            ) : null}
            {!openRow ? <View style={{ marginLeft: "auto" }}>{readAction}</View> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

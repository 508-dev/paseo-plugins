import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { proxyStatus } from "../shared/environment";
import { ActionButton } from "./action-button";
import { messages } from "./messages";
import { proxyStatusPresentation } from "./proxy-status-presentation";

export function ProxyStatus({ theme, hostId }: { theme: PluginTheme; hostId: string }) {
  const { t } = useTranslation(messages);
  const check = useRpc(proxyStatus);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["project-environment-ironproxy", hostId],
    queryFn: () => check({}),
  });
  const { label, canRecheck } = proxyStatusPresentation({
    ready: data?.ready,
    isFetching,
    isError,
  });
  const recheck = useCallback(() => {
    void refetch();
  }, [refetch]);
  const styles = useMemo(
    () => ({
      panel: { padding: 12, borderRadius: 8, backgroundColor: theme.colors.surface1, gap: 8 },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      title: { color: theme.colors.foreground, fontWeight: "600" as const, flexGrow: 1 },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
    }),
    [theme],
  );
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Icon name="Shield" size={16} color={theme.colors.accent} />
        <Text style={styles.title}>IronProxy</Text>
        <Text style={styles.detail}>{t(label)}</Text>
        {canRecheck && (
          <ActionButton
            label={t("proxyRecheck")}
            onPress={recheck}
            theme={theme}
            disabled={isFetching}
          />
        )}
      </View>
      {!isFetching && !isError && data && !data.ready && (
        <Text selectable style={styles.detail}>
          {data.detail}
        </Text>
      )}
    </View>
  );
}

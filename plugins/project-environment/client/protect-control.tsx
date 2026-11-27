import { useState, useMemo, useCallback } from "react";
import { View, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  configureProxy,
  proxyRoute,
  type VariableTarget,
  type AllowedRequest,
} from "../shared/environment";
import { messages } from "./messages";
import { AllowedRequests } from "./allowed-requests";
import { ProxyRouteField } from "./proxy-route-field";
import { ActionButton } from "./action-button";
export function ProtectControl({
  name,
  target,
  hostId,
  workspaceId,
  theme,
  proxyUrl,
  proxyMethod,
  requests,
  showAction = true,
  onAction,
}: {
  name: string;
  target: VariableTarget;
  hostId: string;
  workspaceId?: string;
  theme: PluginTheme;
  proxyUrl?: string;
  proxyMethod?: AllowedRequest["method"];
  requests?: AllowedRequest[];
  showAction?: boolean;
  onAction?(): void;
}) {
  const scope = target.kind;
  const { t } = useTranslation(messages);
  const configure = useRpc(configureProxy);
  const cache = useQueryClient();
  const [routing, setRouting] = useState(false);
  const [items, setItems] = useState(requests ?? []);
  const [method, setMethod] = useState<AllowedRequest["method"]>(proxyMethod ?? "GET");
  const [route, setUrl] = useState(proxyUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const apply = useCallback(
    async (url: string | null) => {
      setBusy(true);
      setRouteError("");
      try {
        await configure({
          target,
          name,
          expected: proxyUrl ?? null,
          url,
          previousMethod: proxyMethod ?? "GET",
          method,
          previousRequests: requests ?? [],
          requests: items,
        });
        await Promise.all(
          ["project-environment", "project-environment-catalogue"].map((key) =>
            cache.invalidateQueries({ queryKey: [key, hostId] }),
          ),
        );
        setRouting(false);
      } catch {
        setRouteError(
          "Could not change credential access. Check the saved entry and install the approved IronProxy v0.61.0 binary on the Paseo host.",
        );
      } finally {
        setBusy(false);
      }
    },
    [name, proxyUrl, configure, target, cache, hostId, proxyMethod, method, requests, items],
  );
  const saveRoute = useCallback(() => void apply(route), [apply, route]);
  const clearRoute = useCallback(() => void apply(null), [apply]);
  const toggleRouting = useCallback(() => {
    onAction?.();
    setMethod(proxyMethod ?? "GET");
    setItems(requests ?? []);
    setUrl(proxyUrl ?? "");
    setRouteError("");
    setRouting((open) => !open);
  }, [requests, proxyUrl, proxyMethod, onAction]);
  const closeRouting = useCallback(() => setRouting(false), []);
  const dismiss = useCallback(
    (open: boolean) => {
      if (!busy) setRouting(open);
    },
    [busy],
  );
  const styles = useMemo(
    () => ({
      footer: {
        justifyContent: "flex-end" as const,
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );
  return (
    <>
      {showAction && (
        <ActionButton
          label={proxyUrl ? "Protected settings" : "Protect"}
          onPress={toggleRouting}
          theme={theme}
        />
      )}
      {routing && (
        <Modal
          title={`Protect ${name} · ${scope === "project" ? "Project defaults" : "Workspace"}`}
          open={routing}
          onOpenChange={dismiss}
        >
          <Modal.Content>
            <ProxyRouteField
              method={method}
              setMethod={setMethod}
              value={route}
              onChangeText={setUrl}
              disabled={busy}
              theme={theme}
            />
            <AllowedRequests
              {...{ theme, workspaceId, scope, hostId, name, items, setItems }}
              base={route}
              disabled={busy}
            />
            <View style={styles.footer}>
              <ActionButton
                label={t("cancel")}
                disabled={busy}
                theme={theme}
                onPress={closeRouting}
              />
              <ActionButton
                variant="primary"
                label="Save protection"
                onPress={saveRoute}
                disabled={busy || !proxyRoute.safeParse(route).success}
                theme={theme}
              />
            </View>
            {proxyUrl && (
              <ActionButton
                label="Allow commands to read the raw value again"
                variant="destructive"
                disabled={busy}
                theme={theme}
                onPress={clearRoute}
              />
            )}

            {routeError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {routeError}
              </Text>
            )}
          </Modal.Content>
        </Modal>
      )}
    </>
  );
}

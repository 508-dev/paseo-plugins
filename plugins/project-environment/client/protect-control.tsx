import { useRef, useState, useMemo, useCallback } from "react";
import { View, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
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
  theme,
  proxyUrl,
  proxyMethod,
  requests,
  dialogOnly = false,
  onClose,
}: {
  name: string;
  target: VariableTarget;
  hostId: string;
  theme: PluginTheme;
  proxyUrl?: string;
  proxyMethod?: AllowedRequest["method"];
  requests?: AllowedRequest[];
  dialogOnly?: boolean;
  onClose?(): void;
}) {
  const scope = target.kind;
  const { t } = useTranslation(messages);
  const toast = useToast();
  const configure = useRpc(configureProxy);
  const cache = useQueryClient();
  const [routing, setRouting] = useState(dialogOnly);
  const [items, setItems] = useState(requests ?? []);
  const [method, setMethod] = useState<AllowedRequest["method"]>(proxyMethod ?? "GET");
  const [route, setUrl] = useState(proxyUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [savedBase, setSavedBase] = useState({
    url: proxyUrl ?? null,
    method: proxyMethod ?? "GET",
  });
  const [editing, edit] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "discard" | null>(null);
  const writing = useRef(false);
  const dirty = route !== (savedBase.url ?? "") || method !== savedBase.method;
  const close = useCallback(() => {
    setRouting(false);
    onClose?.();
  }, [onClose]);
  const apply = useCallback(
    async (
      url: string | null,
      verb: AllowedRequest["method"],
      next: AllowedRequest[],
      finish: boolean,
    ) => {
      if (writing.current) return false;
      writing.current = true;
      setBusy(true);
      setRouteError("");
      try {
        await configure({
          target,
          name,
          expected: savedBase.url,
          url,
          previousMethod: savedBase.method,
          method: verb,
          previousRequests: items,
          requests: next,
        });
      } catch {
        setRouteError(
          "Could not save. Check IronProxy setup or reopen settings to load any changes from another session.",
        );
        return false;
      } finally {
        writing.current = false;
        setBusy(false);
      }
      setItems(next);
      setSavedBase({ url, method: verb });
      toast.show(url ? `Protection updated for ${name}` : `Protection removed from ${name}`, {
        variant: "success",
      });
      if (finish) close();
      void cache.invalidateQueries({ queryKey: ["project-environment", hostId] });
      void cache.invalidateQueries({ queryKey: ["project-environment-catalogue", hostId] });
      return true;
    },
    [configure, target, name, savedBase, items, toast, close, cache, hostId],
  );
  const saveRoute = useCallback(
    () => void apply(route, method, items, true),
    [apply, route, method, items],
  );
  const clearRoute = useCallback(() => void apply(null, "GET", [], true), [apply]);
  const saveItems = useCallback(
    (next: AllowedRequest[]) => apply(savedBase.url, savedBase.method, next, false),
    [apply, savedBase],
  );
  const toggleRouting = useCallback(() => {
    setSavedBase({ url: proxyUrl ?? null, method: proxyMethod ?? "GET" });
    setMethod(proxyMethod ?? "GET");
    setItems(requests ?? []);
    setUrl(proxyUrl ?? "");
    setRouteError("");
    setConfirm(null);
    edit(false);
    setRouting(true);
  }, [requests, proxyUrl, proxyMethod]);
  const closeRouting = useCallback(() => {
    if (writing.current) return;
    if (dirty || editing) setConfirm("discard");
    else close();
  }, [dirty, editing, close]);
  const dismiss = useCallback(
    (open: boolean) => {
      if (!open) closeRouting();
    },
    [closeRouting],
  );
  const keep = useCallback(() => setConfirm(null), []);
  const askRemove = useCallback(() => setConfirm("remove"), []);
  const styles = useMemo(
    () => ({
      footer: {
        justifyContent: "flex-end" as const,
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      hide: { display: "none" as const },
      form: { gap: 12 },
      body: { color: theme.colors.foreground },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );
  return (
    <>
      {!dialogOnly && (
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
            {confirm ? (
              <>
                <Text style={styles.body}>
                  {confirm === "remove"
                    ? `Remove protection from ${name}? Commands will be able to read its raw value.`
                    : "Discard unfinished edits? Requests you already allowed are saved."}
                </Text>
                <View style={styles.footer}>
                  <ActionButton
                    label={confirm === "remove" ? "Keep protected" : "Keep editing"}
                    onPress={keep}
                    disabled={busy}
                    theme={theme}
                  />
                  <ActionButton
                    label={confirm === "remove" ? "Remove protection" : "Discard edits"}
                    variant="destructive"
                    onPress={confirm === "remove" ? clearRoute : close}
                    disabled={busy}
                    theme={theme}
                  />
                </View>
              </>
            ) : null}
            <View style={confirm ? styles.hide : styles.form}>
              <ProxyRouteField
                method={method}
                setMethod={setMethod}
                value={route}
                onChangeText={setUrl}
                disabled={busy}
                theme={theme}
              />
              {savedBase.url && (
                <AllowedRequests
                  {...{ theme, target, name, items, editing, edit }}
                  base={savedBase.url}
                  save={saveItems}
                  disabled={busy}
                />
              )}
              <View style={styles.footer}>
                {savedBase.url && (
                  <ActionButton
                    label="Remove protection…"
                    disabled={busy}
                    theme={theme}
                    onPress={askRemove}
                  />
                )}
                <ActionButton
                  label={dirty || editing ? t("cancel") : "Done"}
                  disabled={busy}
                  theme={theme}
                  onPress={closeRouting}
                />
                {(dirty || !savedBase.url) && (
                  <ActionButton
                    variant="primary"
                    label={busy ? t("saving") : "Save endpoint"}
                    onPress={saveRoute}
                    disabled={busy || editing || !proxyRoute.safeParse(route).success}
                    theme={theme}
                  />
                )}
              </View>
            </View>
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

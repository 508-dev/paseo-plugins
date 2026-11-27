export function proxyStatusPresentation({
  ready,
  isFetching,
  isError,
}: {
  ready: boolean | undefined;
  isFetching: boolean;
  isError: boolean;
}) {
  let label: "proxyChecking" | "proxyUnavailable" | "proxyVerified" | "proxySetupRequired";
  if (isFetching) label = "proxyChecking";
  else if (isError) label = "proxyUnavailable";
  else if (ready) label = "proxyVerified";
  else label = "proxySetupRequired";
  return { label, canRecheck: isError || !ready };
}

import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatClockTime,
  formatLongDate,
  formatRelativeTime,
  formatRupeeAmount,
  toISODate,
} from "../domain/format";
import {
  applyFetch,
  goldPer8g,
  goldPerGram,
  isCacheFresh,
  silverPerGram,
  type CachedRates,
  type RefreshError,
} from "../domain/metalRates";
import { goldHistoryRows, type GoldHistoryRow } from "../domain/goldHistory";
import { fetchGoldHistory } from "../rates/goldHistoryApi";
import { fetchRateParts } from "../rates/ibjaApi";
import { loadRatesCache, saveRatesCache } from "../settings/metalRatesCache";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { CardRow, HistoryTable, NagercoilTable, PerGramRow, RateCard, RateDate, type RateLine } from "../ui/MetalRates";
import { T } from "../ui/Text";
import { Button } from "../ui/forms";
import { useTabBack } from "../ui/useGoBack";
import { colors } from "../ui/theme";

const GOLD_LINES: [RateLine, RateLine] = [
  { label: "per gram", format: (v) => formatRupeeAmount(goldPerGram(v), { max: 1 }) },
  { label: "per 8 g", format: (v) => formatRupeeAmount(goldPer8g(v), { max: 1 }) },
];
// A metal with no rate yet: its card reads "—".
const NO_RATE = { am: null, pm: null };
const SILVER_LINES: [RateLine, RateLine] = [
  { label: "per kg", format: (v) => formatRupeeAmount(v) },
  { label: "per gram", format: (v) => formatRupeeAmount(silverPerGram(v), { min: 2 }) },
];

// The rates API sends no CORS headers, so a browser may refuse the request. Said on screen rather than left to look like a bug.
const BROWSER_NOTE = Platform.select({
  ios: null,
  android: null,
  web: "Browsers may block this rates source. The page works in the iPhone app.",
});

// Today's IBJA gold and silver rates, for daily viewing only (not linked to Assets, Gifts or the pledge tracker). Nothing is fetched until
// this page is opened. The last good answer is kept on the phone: it shows at once, and the network is only asked again when it is over
// an hour old or on pull-to-refresh (domain/metalRates.ts decides what is kept).
export default function RatesScreen() {
  const goBack = useTabBack();
  const insets = useSafeAreaInsets();
  const [cache, setCache] = useState<CachedRates | null>(null);
  const [error, setError] = useState<RefreshError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async (previous: CachedRates | null) => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const result = applyFetch(previous, await fetchRateParts(), Date.now());
      if (result.error === null && result.cache) await saveRatesCache(result.cache).catch(() => {});
      setCache(result.cache);
      setError(result.error);
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadRatesCache().then((saved) => {
        if (!alive) return;
        setCache(saved);
        setLoaded(true);
        if (saved && isCacheFresh(saved, Date.now())) setError(null);
        else refresh(saved);
      });
      return () => {
        alive = false;
      };
    }, [refresh]),
  );

  // The local (Nagercoil) rates, asked for each time the page is opened and on pull-to-refresh. A failed fetch keeps what was shown
  // before, and says "unavailable" if there never was anything.
  // The Nagercoil 22K/24K history from our own backend (rates/goldHistoryApi.ts), the real local price.
  const [nagercoil, setNagercoil] = useState<GoldHistoryRow[] | null>(null);
  const [nagercoilTried, setNagercoilTried] = useState(false);
  const loadLocal = useCallback(() => {
    fetchGoldHistory().then((rows) => {
      if (rows) setNagercoil(rows);
      setNagercoilTried(true);
    });
  }, []);
  useFocusEffect(loadLocal);
  const refreshAll = () => {
    refresh(cache);
    loadLocal();
  };

  const now = new Date();
  const snapshot = cache?.snapshot;
  const nagercoilRows = nagercoil ?? [];

  let body;
  if (!loaded || (!cache && refreshing)) {
    body = <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  } else if (!cache || !snapshot) {
    body = (
      <View style={styles.emptyBox}>
        <T style={styles.empty}>
          {error === "unavailable"
            ? "Today's rates are not published yet, and there is no earlier rate to show. Try again later."
            : "Couldn't load the rates. Check your internet connection and try again."}
        </T>
        {BROWSER_NOTE ? <T style={styles.empty}>{BROWSER_NOTE}</T> : null}
        <Button label="Try again" onPress={() => refresh(null)} style={{ alignSelf: "center", marginTop: 16 }} />
      </View>
    );
  } else {
    const fetched = new Date(cache.fetchedAt);
    const fetchedText = toISODate(fetched) === toISODate(now) ? formatClockTime(fetched) : `${formatClockTime(fetched)} on ${formatLongDate(toISODate(fetched))}`;
    body = (
      <>
        {error ? (
          <View style={styles.banner}>
            <T style={styles.bannerText}>
              {error === "unavailable" ? "Rates are not published yet" : "Couldn't refresh"} — showing rates from {fetchedText}
            </T>
            {error === "network" && BROWSER_NOTE ? <T style={styles.bannerText}>{BROWSER_NOTE}</T> : null}
          </View>
        ) : null}
        <T style={styles.updated}>Last updated {formatRelativeTime(cache.fetchedAt, now.getTime())}</T>

        <View style={styles.dates}>
          {snapshot.gold && snapshot.silver && snapshot.gold.date === snapshot.silver.date ? (
            <RateDate date={snapshot.gold.date} now={now} />
          ) : (
            <>
              {snapshot.gold ? <RateDate label="Gold rates" date={snapshot.gold.date} now={now} /> : <T style={styles.note}>No gold rate available.</T>}
              {snapshot.silver ? <RateDate label="Silver rates" date={snapshot.silver.date} now={now} /> : <T style={styles.note}>No silver rate available.</T>}
            </>
          )}
        </View>
        <CardRow>
          <RateCard title="24K (999)" rate={snapshot.gold?.rates["999"] ?? NO_RATE} lines={GOLD_LINES} />
          <RateCard title="22K (916)" rate={snapshot.gold?.rates["916"] ?? NO_RATE} lines={GOLD_LINES} />
          <RateCard title="Silver 999" rate={snapshot.silver?.rate ?? NO_RATE} lines={SILVER_LINES} />
        </CardRow>

        <T weight="medium" style={styles.section}>
          Last few days
        </T>
        <HistoryTable days={snapshot.history} />

        <T style={styles.footnote}>IBJA benchmark rates, excluding GST and making charges.</T>
      </>
    );
  }

  return (
    <View style={styles.page}>
      <AppHeader
        title="Gold & Silver Rates"
        onBack={goBack}
        right={Platform.select({
          ios: undefined,
          android: undefined,
          // A browser has no pull-to-refresh.
          web: <HeaderTextButton label="Refresh" onPress={refreshAll} />,
        })}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing && !!cache} onRefresh={refreshAll} tintColor={colors.primary} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {nagercoilTried ? (
          <>
            <T weight="medium" style={[styles.section, { marginTop: 0 }]}>
              Nagercoil
            </T>
            {nagercoilRows.length > 0 ? (
              <>
                <RateDate date={nagercoilRows[0].date} now={now} />
                <PerGramRow price22k={nagercoilRows[0].price22k} price24k={nagercoilRows[0].price24k} />
                <NagercoilTable rows={goldHistoryRows(nagercoilRows)} />
                <T style={styles.footnote}>Nagercoil rates as listed on Groww. Your jeweller's price may differ.</T>
              </>
            ) : (
              <T style={styles.note}>Nagercoil rates are not available right now.</T>
            )}
          </>
        ) : null}
        {nagercoilTried ? (
          <T weight="medium" style={styles.section}>
            IBJA benchmark
          </T>
        ) : null}
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  spinner: { marginTop: 48 },
  emptyBox: { marginTop: 32 },
  empty: { textAlign: "center", color: colors.textSecondary, marginHorizontal: 16, marginBottom: 8 },
  banner: { backgroundColor: "#fff1d6", borderRadius: 4, padding: 12, marginBottom: 8, gap: 4 },
  bannerText: { fontSize: 13, lineHeight: 19, color: "#8a5a00" },
  updated: { fontSize: 13, color: colors.textSecondary },
  dates: { marginTop: 8, gap: 4 },
  section: { fontSize: 18, marginTop: 20, marginBottom: 6 },
  note: { color: colors.textSecondary },
  footnote: { fontSize: 12, color: colors.textSecondary, marginTop: 20, textAlign: "center" },
});

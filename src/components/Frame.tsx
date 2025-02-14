"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

interface NutStats {
  fid: number;
  username: string;
  sent: number;
  received: number;
  failedAttempts: number;
  lastUpdated: Date;
}

interface LeaderboardEntry {
  fid: number;
  username: string;
  totalPoints: number;
}

enum ViewState {
  STATS,
  LEADERBOARD,
  SEARCH
}

async function fetchNutStats(fid: number): Promise<NutStats> {
  const response = await fetch(`/api/nuts/stats?fid=${fid}`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/nuts/leaderboard');
  if (!response.ok) throw new Error('Failed to fetch leaderboard');
  return response.json();
}

function calculateDailyAllowance(lastUpdated: Date): number {
  const now = new Date();
  const lastReset = new Date(lastUpdated);
  lastReset.setUTCHours(ALLOWANCE_RESET_HOUR, 0, 0, 0);
  
  if (now.getUTCDate() !== lastReset.getUTCDate() || 
      now.getUTCMonth() !== lastReset.getUTCMonth() || 
      now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
    return DAILY_ALLOWANCE;
  }
  return Math.max(DAILY_ALLOWANCE - (now.getUTCHours() - ALLOWANCE_RESET_HOUR) * 1, 0);
}

const handleSearch = async () => {
  try {
    if (!searchFid) return;
    const fid = parseInt(searchFid);
    if (isNaN(fid)) throw new Error('Invalid FID');
    
    const results = await fetchNutStats(fid);
    setSearchResults(results);
    setError('');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to search');
    setSearchResults(null);
  }
};

useEffect(() => {
  const loadInitialData = async () => {
    try {
      if (context?.client.added && context.actor?.fid) {
        const stats = await fetchNutStats(context.actor.fid);
        setUserStats(stats);
      }
      
      const leaderboardData = await fetchLeaderboard();
      setLeaderboard(leaderboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  const interval = setInterval(loadInitialData, 30000); // Update every 30 seconds
  loadInitialData();
  
  return () => clearInterval(interval);
}, [context]);

export default function Frame() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.STATS);
  const [userStats, setUserStats] = useState<NutStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [searchFid, setSearchFid] = useState('');
  const [searchResults, setSearchResults] = useState<NutStats | null>(null);
  const [error, setError] = useState('');

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">🥜 Pistachio Watch</h1>
          <p className="text-sm text-gray-400">Tracking since Feb 1, 2025</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button 
            onClick={() => setCurrentView(ViewState.STATS)}
            className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            My Stats
          </button>
          <button 
            onClick={() => setCurrentView(ViewState.LEADERBOARD)}
            className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Leaderboard
          </button>
          <button 
            onClick={() => setCurrentView(ViewState.SEARCH)}
            className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Search FID
          </button>
        </div>

        {error && <div className="text-red-500 mb-4 text-sm">{error}</div>}

        {currentView === ViewState.STATS && userStats && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-purple-600">🥜</span>
                {userStats.username}
              </CardTitle>
              <CardDescription>FID: {userStats.fid}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span>Sent Today:</span>
                <span className="font-bold">{userStats.sent}</span>
              </div>
              <div className="flex justify-between">
                <span>Received Today:</span>
                <span className="font-bold">{userStats.received}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span className="font-bold text-green-500">
                  {calculateDailyAllowance(userStats.lastUpdated)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Failed Attempts:</span>
                <span className="font-bold text-red-500">{userStats.failedAttempts}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {currentView === ViewState.LEADERBOARD && (
          <Card>
            <CardHeader>
              <CardTitle>🥜 Leaderboard</CardTitle>
              <CardDescription>Top 20 Nutty Users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <div key={entry.fid} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-600">#{index + 1}</span>
                      <span>{entry.username}</span>
                    </div>
                    <span className="font-bold">{entry.totalPoints}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {currentView === ViewState.SEARCH && (
          <Card>
            <CardHeader>
              <CardTitle>🔍 Search FID</CardTitle>
              <CardDescription>Enter a FID to check stats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <input
                  type="number"
                  value={searchFid}
                  onChange={(e) => setSearchFid(e.target.value)}
                  className="border rounded-lg p-2"
                  placeholder="Enter FID"
                />
                <button
                  onClick={handleSearch}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Search
                </button>
                {searchResults && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Sent:</span>
                      <span>{searchResults.sent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Received:</span>
                      <span>{searchResults.received}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Failed:</span>
                      <span>{searchResults.failedAttempts}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

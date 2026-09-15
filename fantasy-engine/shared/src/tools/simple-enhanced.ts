// Minimal roster tool for testing
import { espnApi } from '../services/espnApi.js';
import { Player } from '../types/espn.js';

function isActiveNFLPlayer(player: Player): boolean {
  return !!player.team && player.team !== 'FA' && !player.team.startsWith('UNKNOWN');
}

function isUnavailableForWaivers(player: Player): boolean {
  const status = (player.injuryStatus || '').toUpperCase();
  return status.includes('OUT') ||
    status.includes('IR') ||
    status.includes('INJURED_RESERVE') ||
    status.includes('DOUBTFUL') ||
    status.includes('PUP') ||
    status.includes('NFI') ||
    status.includes('SUSPEND');
}

function isActionableWaiverPlayer(player: Player): boolean {
  return isActiveNFLPlayer(player) && !isUnavailableForWaivers(player);
}

export async function getMyRoster(args: { leagueId: string; teamId: string; week?: number }) {
  const { leagueId, teamId, week } = args;
  
  if (!leagueId || !teamId) {
    throw new Error('League ID and Team ID are required');
  }
  
  console.log(`🔍 Fetching roster and waiver wire data for league ${leagueId}, team ${teamId}...`);
  
  // Get current roster
  const roster = await espnApi.getTeamRoster(leagueId, teamId, week);
  console.log(`✅ Roster fetched: ${roster.starters.length} starters, ${roster.bench.length} bench`);
  
  // Get available players (waiver wire + free agents)
  console.log(`🔍 Fetching available players from waiver wire...`);
  const availablePlayers = await espnApi.getAvailablePlayers(leagueId, week);
  const actionableAvailablePlayers = availablePlayers.filter(isActionableWaiverPlayer);
  const excludedPlayers = availablePlayers.length - actionableAvailablePlayers.length;
  console.log(`✅ Available players fetched: ${availablePlayers.length} total (${actionableAvailablePlayers.length} actionable, ${excludedPlayers} excluded as NFL FA/unavailable)`);
  
  // Sort and filter actionable waiver players by position and relevance.
  // Excludes NFL free agents and OUT/IR/suspended players so the LLM cannot
  // recommend non-actionable names like unsigned veterans or season-ending injuries.
  const topAvailableByPosition: Record<string, any[]> = {
    QB: actionableAvailablePlayers
      .filter(p => p.position === 'QB')
      .sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
      .slice(0, 5), // Top 5 QBs
    RB: actionableAvailablePlayers
      .filter(p => p.position === 'RB') 
      .sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
      .slice(0, 8), // Top 8 RBs
    WR: actionableAvailablePlayers
      .filter(p => p.position === 'WR')
      .sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
      .slice(0, 8), // Top 8 WRs  
    TE: actionableAvailablePlayers
      .filter(p => p.position === 'TE')
      .sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
      .slice(0, 5), // Top 5 TEs
    'D/ST': actionableAvailablePlayers
      .filter(p => p.position === 'D/ST')
      .sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
      .slice(0, 5), // Top 5 defenses
    K: actionableAvailablePlayers
      .filter(p => p.position === 'K')
      .sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0))
      .slice(0, 5) // Top 5 kickers
  };
  
  const totalWaiverPlayers = Object.values(topAvailableByPosition).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`📊 Top waiver wire players by position: QB(${topAvailableByPosition.QB.length}), RB(${topAvailableByPosition.RB.length}), WR(${topAvailableByPosition.WR.length}), TE(${topAvailableByPosition.TE.length}), D/ST(${topAvailableByPosition['D/ST'].length}), K(${topAvailableByPosition.K.length}) = ${totalWaiverPlayers} total`);
  
  return {
    success: true,
    leagueId,
    teamId,
    starters: roster.starters,
    bench: roster.bench,
    injuredReserve: roster.injuredReserve || [],
    availablePlayers: topAvailableByPosition,
    message: `Roster retrieved with ${totalWaiverPlayers} top waiver wire options by position`
  };
}
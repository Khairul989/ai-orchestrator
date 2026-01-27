/**
 * Voting System
 * Flexible voting mechanisms for multi-agent decisions
 */

import { EventEmitter } from 'events';

// ============ Interfaces ============

export type VotingStrategy =
  | 'simple_majority'
  | 'absolute_majority'
  | 'plurality'
  | 'unanimous'
  | 'qualified_majority'
  | 'weighted';

export interface VotingSystemConfig {
  defaultStrategy: VotingStrategy;
  allowLateVotes: boolean;
  anonymousVoting: boolean;
  requireJustification: boolean;
  minVoterParticipation: number; // 0-1
  tieBreaker: 'random' | 'first_vote' | 'leader_decides' | 'revote';
  maxHistorySize: number;
}

export interface BallotOption {
  id: string;
  label: string;
  description?: string;
  value?: unknown;
}

export interface Ballot {
  id: string;
  title: string;
  description: string;
  options: BallotOption[];
  strategy: VotingStrategy;
  createdBy: string;
  createdAt: number;
  closesAt?: number;
  status: 'open' | 'closed' | 'cancelled';
  eligibleVoters?: string[];
  metadata?: Record<string, unknown>;
}

export interface Vote {
  id: string;
  ballotId: string;
  voterId: string;
  optionIds: string[];
  weight: number;
  justification?: string;
  timestamp: number;
  isAnonymous: boolean;
}

export interface VoteTally {
  optionId: string;
  voteCount: number;
  weightedCount: number;
  percentage: number;
  voters: string[];
}

export interface VotingResult {
  ballotId: string;
  strategy: VotingStrategy;
  totalVoters: number;
  totalVotesCast: number;
  participationRate: number;
  optionTallies: Map<string, VoteTally>;
  winner: BallotOption | null;
  isTie: boolean;
  tieBreakUsed: boolean;
  decidedAt: number;
  reasoning: string;
}

export interface VotingHistory {
  ballotId: string;
  result: VotingResult;
  archivedAt: number;
}

export interface CreateBallotOptions {
  strategy?: VotingStrategy;
  closesAt?: number;
  eligibleVoters?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface VotingStats {
  totalBallots: number;
  openBallots: number;
  closedBallots: number;
  cancelledBallots: number;
  totalVotesCast: number;
  averageParticipation: number;
  strategyUsage: Map<VotingStrategy, number>;
}

// ============ Voting System Class ============

export class VotingSystem extends EventEmitter {
  private static instance: VotingSystem;
  private config: VotingSystemConfig;

  private defaultConfig: VotingSystemConfig = {
    defaultStrategy: 'simple_majority',
    allowLateVotes: false,
    anonymousVoting: false,
    requireJustification: false,
    minVoterParticipation: 0.5,
    tieBreaker: 'random',
    maxHistorySize: 100,
  };

  private ballots: Map<string, Ballot> = new Map();
  private votes: Map<string, Vote[]> = new Map();
  private history: VotingHistory[] = [];

  static getInstance(): VotingSystem {
    if (!this.instance) {
      this.instance = new VotingSystem();
    }
    return this.instance;
  }

  private constructor() {
    super();
    this.config = { ...this.defaultConfig };
  }

  configure(config: Partial<VotingSystemConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configured', this.config);
  }

  getConfig(): VotingSystemConfig {
    return { ...this.config };
  }

  // ============ Ballot Management ============

  createBallot(
    title: string,
    options: Omit<BallotOption, 'id'>[],
    opts?: CreateBallotOptions
  ): Ballot {
    const ballotId = `ballot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const ballot: Ballot = {
      id: ballotId,
      title,
      description: opts?.description || '',
      options: options.map((opt, idx) => ({
        id: `option-${idx}-${Math.random().toString(36).substr(2, 6)}`,
        label: opt.label,
        description: opt.description,
        value: opt.value,
      })),
      strategy: opts?.strategy || this.config.defaultStrategy,
      createdBy: 'system',
      createdAt: Date.now(),
      closesAt: opts?.closesAt,
      status: 'open',
      eligibleVoters: opts?.eligibleVoters,
      metadata: opts?.metadata,
    };

    this.ballots.set(ballotId, ballot);
    this.votes.set(ballotId, []);

    this.emit('ballot:created', ballot);

    return ballot;
  }

  getBallot(ballotId: string): Ballot | undefined {
    return this.ballots.get(ballotId);
  }

  getOpenBallots(): Ballot[] {
    const now = Date.now();
    return Array.from(this.ballots.values()).filter(
      ballot =>
        ballot.status === 'open' && (!ballot.closesAt || ballot.closesAt > now)
    );
  }

  closeBallot(ballotId: string): VotingResult {
    const ballot = this.ballots.get(ballotId);
    if (!ballot) {
      throw new Error(`Ballot ${ballotId} not found`);
    }

    if (ballot.status !== 'open') {
      throw new Error(`Ballot ${ballotId} is not open`);
    }

    ballot.status = 'closed';

    const votes = this.votes.get(ballotId) || [];
    const result = this.calculateResult(ballot, votes);

    // Add to history
    this.addToHistory(ballotId, result);

    this.emit('ballot:closed', { ballotId, result });

    return result;
  }

  cancelBallot(ballotId: string): boolean {
    const ballot = this.ballots.get(ballotId);
    if (!ballot) {
      return false;
    }

    if (ballot.status !== 'open') {
      return false;
    }

    ballot.status = 'cancelled';

    this.emit('ballot:cancelled', { ballotId });

    return true;
  }

  // ============ Voting ============

  castVote(
    ballotId: string,
    voterId: string,
    optionIds: string | string[],
    weight: number = 1,
    justification?: string
  ): Vote {
    const ballot = this.ballots.get(ballotId);
    if (!ballot) {
      throw new Error(`Ballot ${ballotId} not found`);
    }

    // Check if ballot is open
    if (ballot.status !== 'open') {
      if (!this.config.allowLateVotes) {
        this.emit('vote:rejected', { ballotId, voterId, reason: 'Ballot is closed' });
        throw new Error(`Ballot ${ballotId} is not open`);
      }
    }

    // Check if ballot has expired
    if (ballot.closesAt && ballot.closesAt < Date.now()) {
      if (!this.config.allowLateVotes) {
        this.emit('vote:rejected', { ballotId, voterId, reason: 'Ballot has expired' });
        throw new Error(`Ballot ${ballotId} has expired`);
      }
    }

    // Check eligibility
    if (ballot.eligibleVoters && !ballot.eligibleVoters.includes(voterId)) {
      this.emit('vote:rejected', { ballotId, voterId, reason: 'Voter not eligible' });
      throw new Error(`Voter ${voterId} is not eligible for ballot ${ballotId}`);
    }

    // Check justification requirement
    if (this.config.requireJustification && !justification) {
      this.emit('vote:rejected', { ballotId, voterId, reason: 'Justification required' });
      throw new Error('Justification is required for voting');
    }

    // Normalize option IDs
    const normalizedOptionIds = Array.isArray(optionIds) ? optionIds : [optionIds];

    // Validate option IDs
    const validOptionIds = ballot.options.map(o => o.id);
    for (const optionId of normalizedOptionIds) {
      if (!validOptionIds.includes(optionId)) {
        this.emit('vote:rejected', { ballotId, voterId, reason: 'Invalid option ID' });
        throw new Error(`Invalid option ID: ${optionId}`);
      }
    }

    // Check if already voted
    const existingVotes = this.votes.get(ballotId) || [];
    const existingVote = existingVotes.find(v => v.voterId === voterId);
    if (existingVote) {
      this.emit('vote:rejected', {
        ballotId,
        voterId,
        reason: 'Already voted - use changeVote',
      });
      throw new Error(`Voter ${voterId} has already voted on ballot ${ballotId}`);
    }

    // Create vote
    const vote: Vote = {
      id: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ballotId,
      voterId,
      optionIds: normalizedOptionIds,
      weight,
      justification,
      timestamp: Date.now(),
      isAnonymous: this.config.anonymousVoting,
    };

    existingVotes.push(vote);
    this.votes.set(ballotId, existingVotes);

    this.emit('vote:cast', { vote, ballot });

    return vote;
  }

  changeVote(
    ballotId: string,
    voterId: string,
    newOptionIds: string | string[]
  ): Vote | null {
    const ballot = this.ballots.get(ballotId);
    if (!ballot) {
      return null;
    }

    if (ballot.status !== 'open') {
      return null;
    }

    const existingVotes = this.votes.get(ballotId) || [];
    const voteIndex = existingVotes.findIndex(v => v.voterId === voterId);

    if (voteIndex === -1) {
      return null;
    }

    const existingVote = existingVotes[voteIndex];

    // Normalize option IDs
    const normalizedOptionIds = Array.isArray(newOptionIds) ? newOptionIds : [newOptionIds];

    // Validate option IDs
    const validOptionIds = ballot.options.map(o => o.id);
    for (const optionId of normalizedOptionIds) {
      if (!validOptionIds.includes(optionId)) {
        return null;
      }
    }

    // Update vote
    existingVote.optionIds = normalizedOptionIds;
    existingVote.timestamp = Date.now();

    this.emit('vote:changed', { vote: existingVote, ballot });

    return existingVote;
  }

  hasVoted(ballotId: string, voterId: string): boolean {
    const votes = this.votes.get(ballotId) || [];
    return votes.some(v => v.voterId === voterId);
  }

  getVotesForBallot(ballotId: string): Vote[] {
    return this.votes.get(ballotId) || [];
  }

  // ============ Result Calculation ============

  calculateResult(ballot: Ballot, votes: Vote[]): VotingResult {
    switch (ballot.strategy) {
      case 'simple_majority':
        return this.applySimpleMajority(ballot, votes);
      case 'absolute_majority':
        return this.applyAbsoluteMajority(ballot, votes);
      case 'plurality':
        return this.applyPlurality(ballot, votes);
      case 'unanimous':
        return this.applyUnanimous(ballot, votes);
      case 'qualified_majority':
        return this.applyQualifiedMajority(ballot, votes);
      case 'weighted':
        return this.applyWeighted(ballot, votes);
      default:
        return this.applySimpleMajority(ballot, votes);
    }
  }

  private calculateTallies(ballot: Ballot, votes: Vote[]): Map<string, VoteTally> {
    const tallies = new Map<string, VoteTally>();

    // Initialize tallies
    for (const option of ballot.options) {
      tallies.set(option.id, {
        optionId: option.id,
        voteCount: 0,
        weightedCount: 0,
        percentage: 0,
        voters: [],
      });
    }

    // Count votes
    for (const vote of votes) {
      for (const optionId of vote.optionIds) {
        const tally = tallies.get(optionId);
        if (tally) {
          tally.voteCount++;
          tally.weightedCount += vote.weight;
          if (!vote.isAnonymous) {
            tally.voters.push(vote.voterId);
          }
        }
      }
    }

    // Calculate percentages
    const totalVotes = votes.length;
    for (const tally of tallies.values()) {
      tally.percentage = totalVotes > 0 ? tally.voteCount / totalVotes : 0;
    }

    return tallies;
  }

  applySimpleMajority(ballot: Ballot, votes: Vote[]): VotingResult {
    const tallies = this.calculateTallies(ballot, votes);
    const totalVoters = ballot.eligibleVoters?.length || votes.length;
    const participationRate = totalVoters > 0 ? votes.length / totalVoters : 0;

    // Find option with most votes
    let maxVotes = 0;
    let winners: BallotOption[] = [];

    for (const [optionId, tally] of tallies) {
      if (tally.voteCount > maxVotes) {
        maxVotes = tally.voteCount;
        winners = [ballot.options.find(o => o.id === optionId)!];
      } else if (tally.voteCount === maxVotes && maxVotes > 0) {
        winners.push(ballot.options.find(o => o.id === optionId)!);
      }
    }

    const isTie = winners.length > 1;
    let winner: BallotOption | null = null;
    let tieBreakUsed = false;

    if (isTie) {
      winner = this.breakTie(winners, this.config.tieBreaker);
      tieBreakUsed = true;
    } else if (winners.length === 1) {
      winner = winners[0];
    }

    const reasoning = isTie
      ? `Tie between ${winners.length} options resolved using ${this.config.tieBreaker}`
      : winner
      ? `Option "${winner.label}" received most votes (${maxVotes}/${votes.length})`
      : 'No votes cast';

    return {
      ballotId: ballot.id,
      strategy: 'simple_majority',
      totalVoters,
      totalVotesCast: votes.length,
      participationRate,
      optionTallies: tallies,
      winner,
      isTie,
      tieBreakUsed,
      decidedAt: Date.now(),
      reasoning,
    };
  }

  applyAbsoluteMajority(ballot: Ballot, votes: Vote[]): VotingResult {
    const tallies = this.calculateTallies(ballot, votes);
    const totalVoters = ballot.eligibleVoters?.length || votes.length;
    const participationRate = totalVoters > 0 ? votes.length / totalVoters : 0;

    // Need more than 50% of total eligible voters
    const requiredVotes = Math.floor(totalVoters / 2) + 1;

    let winner: BallotOption | null = null;
    let maxVotes = 0;

    for (const [optionId, tally] of tallies) {
      if (tally.voteCount >= requiredVotes && tally.voteCount > maxVotes) {
        maxVotes = tally.voteCount;
        winner = ballot.options.find(o => o.id === optionId)!;
      }
    }

    const reasoning = winner
      ? `Option "${winner.label}" received absolute majority (${maxVotes}/${totalVoters}, required ${requiredVotes})`
      : `No option received absolute majority (required ${requiredVotes}/${totalVoters})`;

    return {
      ballotId: ballot.id,
      strategy: 'absolute_majority',
      totalVoters,
      totalVotesCast: votes.length,
      participationRate,
      optionTallies: tallies,
      winner,
      isTie: false,
      tieBreakUsed: false,
      decidedAt: Date.now(),
      reasoning,
    };
  }

  applyPlurality(ballot: Ballot, votes: Vote[]): VotingResult {
    // Same as simple majority but explicitly just picks the option with most votes
    return this.applySimpleMajority(ballot, votes);
  }

  applyUnanimous(ballot: Ballot, votes: Vote[]): VotingResult {
    const tallies = this.calculateTallies(ballot, votes);
    const totalVoters = ballot.eligibleVoters?.length || votes.length;
    const participationRate = totalVoters > 0 ? votes.length / totalVoters : 0;

    let winner: BallotOption | null = null;

    // All votes must be for the same option
    if (votes.length > 0) {
      const firstVoteOptionId = votes[0].optionIds[0];
      const allSame = votes.every(
        v => v.optionIds.length === 1 && v.optionIds[0] === firstVoteOptionId
      );

      if (allSame && votes.length === totalVoters) {
        winner = ballot.options.find(o => o.id === firstVoteOptionId)!;
      }
    }

    const reasoning = winner
      ? `Unanimous decision for "${winner.label}" (${votes.length}/${totalVoters})`
      : 'Unanimous consensus not reached';

    return {
      ballotId: ballot.id,
      strategy: 'unanimous',
      totalVoters,
      totalVotesCast: votes.length,
      participationRate,
      optionTallies: tallies,
      winner,
      isTie: false,
      tieBreakUsed: false,
      decidedAt: Date.now(),
      reasoning,
    };
  }

  applyQualifiedMajority(ballot: Ballot, votes: Vote[]): VotingResult {
    const tallies = this.calculateTallies(ballot, votes);
    const totalVoters = ballot.eligibleVoters?.length || votes.length;
    const participationRate = totalVoters > 0 ? votes.length / totalVoters : 0;

    // Need 2/3 majority (67%)
    const requiredVotes = Math.ceil(totalVoters * 0.67);

    let winner: BallotOption | null = null;
    let maxVotes = 0;

    for (const [optionId, tally] of tallies) {
      if (tally.voteCount >= requiredVotes && tally.voteCount > maxVotes) {
        maxVotes = tally.voteCount;
        winner = ballot.options.find(o => o.id === optionId)!;
      }
    }

    const reasoning = winner
      ? `Option "${winner.label}" received qualified majority (${maxVotes}/${totalVoters}, required ${requiredVotes})`
      : `No option received qualified majority (required ${requiredVotes}/${totalVoters})`;

    return {
      ballotId: ballot.id,
      strategy: 'qualified_majority',
      totalVoters,
      totalVotesCast: votes.length,
      participationRate,
      optionTallies: tallies,
      winner,
      isTie: false,
      tieBreakUsed: false,
      decidedAt: Date.now(),
      reasoning,
    };
  }

  applyWeighted(ballot: Ballot, votes: Vote[]): VotingResult {
    const tallies = this.calculateTallies(ballot, votes);
    const totalVoters = ballot.eligibleVoters?.length || votes.length;
    const participationRate = totalVoters > 0 ? votes.length / totalVoters : 0;

    // Find option with highest weighted count
    let maxWeightedCount = 0;
    let winners: BallotOption[] = [];

    for (const [optionId, tally] of tallies) {
      if (tally.weightedCount > maxWeightedCount) {
        maxWeightedCount = tally.weightedCount;
        winners = [ballot.options.find(o => o.id === optionId)!];
      } else if (tally.weightedCount === maxWeightedCount && maxWeightedCount > 0) {
        winners.push(ballot.options.find(o => o.id === optionId)!);
      }
    }

    const isTie = winners.length > 1;
    let winner: BallotOption | null = null;
    let tieBreakUsed = false;

    if (isTie) {
      winner = this.breakTie(winners, this.config.tieBreaker);
      tieBreakUsed = true;
    } else if (winners.length === 1) {
      winner = winners[0];
    }

    const reasoning = isTie
      ? `Tie between ${winners.length} options resolved using ${this.config.tieBreaker}`
      : winner
      ? `Option "${winner.label}" received highest weighted score (${maxWeightedCount})`
      : 'No votes cast';

    return {
      ballotId: ballot.id,
      strategy: 'weighted',
      totalVoters,
      totalVotesCast: votes.length,
      participationRate,
      optionTallies: tallies,
      winner,
      isTie,
      tieBreakUsed,
      decidedAt: Date.now(),
      reasoning,
    };
  }

  // ============ Tie Breaking ============

  breakTie(
    options: BallotOption[],
    tieBreaker: VotingSystemConfig['tieBreaker']
  ): BallotOption {
    if (options.length === 0) {
      throw new Error('Cannot break tie with no options');
    }

    if (options.length === 1) {
      return options[0];
    }

    let winner: BallotOption;

    switch (tieBreaker) {
      case 'random':
        winner = options[Math.floor(Math.random() * options.length)];
        break;

      case 'first_vote':
        // Just pick the first option (could be enhanced to track actual first vote)
        winner = options[0];
        break;

      case 'leader_decides':
        // Pick first option as leader's choice (could be enhanced with actual leader)
        winner = options[0];
        break;

      case 'revote':
        // For now, just pick first - in real implementation would trigger new ballot
        winner = options[0];
        break;

      default:
        winner = options[0];
    }

    this.emit('tie:broken', { options, winner, method: tieBreaker });

    return winner;
  }

  // ============ History ============

  private addToHistory(ballotId: string, result: VotingResult): void {
    const historyEntry: VotingHistory = {
      ballotId,
      result,
      archivedAt: Date.now(),
    };

    this.history.push(historyEntry);

    // Trim history if needed
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
  }

  getHistory(limit?: number): VotingHistory[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  // ============ Statistics ============

  getStats(): VotingStats {
    const allBallots = Array.from(this.ballots.values());
    const strategyUsage = new Map<VotingStrategy, number>();

    let totalVotesCast = 0;
    let totalParticipation = 0;
    let participationCount = 0;

    for (const ballot of allBallots) {
      // Count strategy usage
      const count = strategyUsage.get(ballot.strategy) || 0;
      strategyUsage.set(ballot.strategy, count + 1);

      // Calculate participation
      if (ballot.status === 'closed') {
        const votes = this.votes.get(ballot.id) || [];
        totalVotesCast += votes.length;

        const totalVoters = ballot.eligibleVoters?.length || votes.length;
        if (totalVoters > 0) {
          totalParticipation += votes.length / totalVoters;
          participationCount++;
        }
      }
    }

    const averageParticipation =
      participationCount > 0 ? totalParticipation / participationCount : 0;

    return {
      totalBallots: allBallots.length,
      openBallots: allBallots.filter(b => b.status === 'open').length,
      closedBallots: allBallots.filter(b => b.status === 'closed').length,
      cancelledBallots: allBallots.filter(b => b.status === 'cancelled').length,
      totalVotesCast,
      averageParticipation,
      strategyUsage,
    };
  }

  // ============ Cleanup ============

  destroy(): void {
    this.ballots.clear();
    this.votes.clear();
    this.history = [];
    this.removeAllListeners();
  }
}

// Export singleton getter
export function getVotingSystem(): VotingSystem {
  return VotingSystem.getInstance();
}

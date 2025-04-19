import NodeCG from '@nodecg/types';
import { get } from './nodecg-api-context';
import { Tournament, User, Event } from './types/startgg-types';
import keys from '../keys.json';
import { EventsRep, SelectedEvent, TournamentsRep } from '../global-types';

const nodecg: NodeCG.ServerAPI = get();

const startggApiUrl = 'https://api.start.gg/gql/alpha';
const APIstrings = {
  getTournaments: () =>
    `{currentUser{id slug name tournaments{nodes{name id}}}}`,
  getTournamentEvents: (id: string) =>
    `{tournament(id:"${id}"){events{id name}}}`,
  getEventSets: (id: string, page: number) =>
    `{event(id: ${id}){sets(page: ${page}perPage:20filters:{showByes:true}){pageInfo{totalPages} nodes{id phaseGroup{id phase{phaseOrder}} wPlacement round winnerId slots{prereqId prereqType seed{seedNum} entrant{name} standing{stats{score{value}}}}}}}}`,
} as const;

const tournamentsRep = nodecg.Replicant<TournamentsRep>('tournamentsRep', {
  defaultValue: [],
});
const eventsRep = nodecg.Replicant<EventsRep>('eventsRep', {
  defaultValue: [],
});
const selectedEvent = nodecg.Replicant<SelectedEvent>('selectedEvent', {
  defaultValue: { tournament: null, event: null },
});

selectedEvent.on('change', (newVal, oldVal) => {
  if (!newVal) return;
  if (
    newVal.tournament === null &&
    (newVal.event !== null || eventsRep.value.length > 0)
  ) {
    eventsRep.value = [];
    selectedEvent.value = { tournament: null, event: null };
    startggRefresh();
    return;
  }
  if (oldVal && JSON.stringify(newVal) === JSON.stringify(oldVal)) return;

  startggRefresh();
});

function startggFetch(queryString: string) {
  return new Promise<any>((res, rej) => {
    fetch(startggApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + keys.startggKey,
      },
      body: JSON.stringify({
        query: queryString,
      }),
    })
      .then((resp) => {
        return resp.json();
      })
      .then((resp) => {
        if (typeof resp !== 'object' || resp === null) {
          rej('Non-object response from StartGG API');
          return;
        } else if ('errors' in resp && resp.errors) {
          rej(resp.errors);
        } else if ('errorId' in resp && resp.errorId) {
          const msg =
            ('message' in resp && resp.message) ||
            'Unknown error from StartGG API';
          rej({ message: msg, errorId: resp.errorId });
        } else if (!('data' in resp)) {
          rej('No data in response from StartGG API');
        } else res(resp.data);
      })
      .catch((err) => {
        rej(err);
      });
  });
}

function startggRefresh() {
  startggFetch(APIstrings.getTournaments())
    .then((resp: { currentUser: User }) => {
      const user = resp.currentUser;
      if ('tournaments' in user && user.tournaments && user.tournaments.nodes) {
        const repTournaments: TournamentsRep = [];
        user.tournaments.nodes.forEach((tournament) => {
          if (tournament && tournament.id && tournament.name)
            repTournaments.push({
              id: tournament.id,
              name: tournament.name,
            });
        });
        tournamentsRep.value = repTournaments;
      }
      nodecg.log.info(
        `Fetched tournaments from StartGG user: ${user.name} (${user.slug})`
      );
      if (selectedEvent.value.tournament !== null) {
        const tournament = tournamentsRep.value[selectedEvent.value.tournament];
        if (tournament) {
          return startggFetch(APIstrings.getTournamentEvents(tournament.id));
        } else return Promise.resolve(null);
      }
    })
    .then((resp: { tournament: Tournament }) => {
      if (!resp) return Promise.resolve(null);
      if ('events' in resp.tournament && resp.tournament.events) {
        const events = resp.tournament.events;
        const repEvents: EventsRep = [];
        events.forEach((event) => {
          if (event && event.id && event.name)
            repEvents.push({ id: event.id, name: event.name });
        });
        if (JSON.stringify(repEvents) !== JSON.stringify(eventsRep.value))
          selectedEvent.value.event = null;
        eventsRep.value = repEvents;
        if (selectedEvent.value.event !== null) {
          return startggFetchEventSets(repEvents[selectedEvent.value.event].id);
        } else return Promise.resolve(null);
      } else {
        return Promise.reject('No events in response from StartGG API');
      }
    })
    .then((sets) => {
      //console.log('Fetched sets from StartGG:');
      //console.log(sets);
    })
    .catch((err) => {
      nodecg.log.error('Error fetching update from StartGG:');
      nodecg.log.error(err);
    });
}

function startggFetchEventSets(
  eventId: string,
  page?: number,
  incomingSets?: MySet[]
) {
  if (!page) page = 1;
  return new Promise<MySet[]>((res, rej) => {
    console.log(`Fetching sets for event ${eventId} page ${page}`);
    startggFetch(APIstrings.getEventSets(eventId, page))
      .then((resp: { event: Event }) => {
        if (!resp || !resp.event) {
          return Promise.reject('No event in response from StartGG API');
        }
        if (!resp.event.sets) {
          return Promise.reject('No sets in response from StartGG API');
        }
        if (!resp.event.sets.nodes) {
          return Promise.reject('No nodes in response from StartGG API');
        }
        if (!resp.event.sets.pageInfo) {
          return Promise.reject('No pageInfo in response from StartGG API');
        }
        if (!resp.event.sets.pageInfo.totalPages) {
          return Promise.reject('No totalPages in response from StartGG API');
        }
        const sets = resp.event.sets.nodes;
        const totalPages = resp.event.sets.pageInfo.totalPages;
        const repSets = sets
          .filter((set) => {
            return isUsableSet(set);
          })
          .map((inSet) => {
            const set = inSet as UsableStartGGSet;
            const rtn: MySet = {
              id: set.id,
              phaseGroupId: String(set.phaseGroup.id),
              phaseOrder: set.phaseGroup.phase.phaseOrder,
              wPlacement: set.wPlacement,
              round: set.round,
              winnerId: String(set.winnerId),
              slots: set.slots.map((slot) => {
                return {
                  prereqId: String(slot.prereqId),
                  prereqType: slot.prereqType,
                  seedNum: slot.seed ? slot.seed.seedNum : null,
                  entrantName: slot.entrant ? slot.entrant.name : null,
                  scoreValue: slot.standing
                    ? slot.standing.stats.score.value
                    : null,
                };
              }),
            };
            return rtn;
          });
        if (incomingSets) {
          incomingSets.push(...repSets);
        } else incomingSets = repSets;
        if (totalPages > page) {
          return startggFetchEventSets(eventId, page + 1, incomingSets);
        } else return Promise.resolve(incomingSets);
      })
      .then((sets) => {
        res(sets);
      })
      .catch((err) => {
        rej(err);
      });
  });
}

nodecg.listenFor('startggRefresh', () => {
  nodecg.log.info('Refreshing StartGG info');
  startggRefresh();
});

type MySet = {
  id: string;
  phaseGroupId: string;
  phaseOrder: number;
  wPlacement: number;
  round: number;
  winnerId: string;
  slots: {
    prereqId: string | null;
    prereqType: string;
    seedNum: number | null;
    entrantName: string | null;
    scoreValue: number | null;
  }[];
};

type UsableStartGGSet = {
  id: string;
  phaseGroup: { id: string; phase: { phaseOrder: number } };
  wPlacement: number;
  round: number;
  winnerId: number;
  slots: {
    prereqId: string | number;
    prereqType: string;
    seed: { seedNum: number } | null;
    entrant: { name: string } | null;
    standing: { stats: { score: { value: number | null } } } | null;
  }[];
};
//has to be type any because Typescript is dumb and does not allow a string to be confirmed to be a number or string, even though a string is clearly a string and therefore to say its either a number or a string is correct
function isUsableSet(set: any): set is UsableStartGGSet {
  if (!set) {
    nodecg.log.error('Set is null or undefined');
    return false;
  }
  if (!set.slots) {
    nodecg.log.error(`Set has no slots. Offending set: ${JSON.stringify(set)}`);
    return false;
  }
  if (set.slots.length !== 2) {
    nodecg.log.error(
      `Set has no 2 slots. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }
  if (
    set.slots.every((slot: any) => {
      return !slot.prereqType || slot.prereqType === 'bye';
    })
  ) {
    //console.log(`Skipping set with no players`);
    return false;
  }
  set.slots.forEach((slot: any) => {
    if (!slot) {
      nodecg.log.error(
        `Slot is null or undefined. Offending set: ${JSON.stringify(set)}`
      );
      return false;
    }
    if (typeof slot.prereqId !== 'string' && slot.prereqId !== null) {
      nodecg.log.error(
        `Slot has no prereqId. Offending set: ${JSON.stringify(set)}`
      );
      return false;
    }
    if (typeof slot.prereqType !== 'string') {
      nodecg.log.error(
        `Slot has no prereqType. Offending set: ${JSON.stringify(set)}`
      );
      return false;
    }
    if (!slot.seed && slot.prereqType !== 'bye') {
      nodecg.log.error(
        `Slot has no seed. Offending set: ${JSON.stringify(set)}`
      );
      return false;
    }
    if (slot.seed && typeof slot.seed.seedNum !== 'number') {
      nodecg.log.error(
        `Slot has no seedNum. Offending set: ${JSON.stringify(set)}`
      );
      return false;
    }
    if (!slot.entrant) {
      if (slot.entrant !== null) {
        nodecg.log.error(
          `Slot has no entrant. Offending set: ${JSON.stringify(set)}`
        );
        return false;
      }
    } else if (typeof slot.entrant.name !== 'string') {
      nodecg.log.error(
        `Slot has no entrant name. Offending set: ${JSON.stringify(set)}`
      );
      return false;
    }
    if (!slot.standing) {
      if (slot.standing !== null) {
        nodecg.log.error(
          `Slot has no standing. Offending set: ${JSON.stringify(set)}`
        );
        return false;
      }
    } else {
      if (!slot.standing.stats) {
        nodecg.log.error(
          `Slot has no standing stats. Offending set: ${JSON.stringify(set)}`
        );
        return false;
      }
      if (!slot.standing.stats.score) {
        nodecg.log.error(
          `Slot has no standing score. Offending set: ${JSON.stringify(set)}`
        );
        return false;
      }
      if (typeof slot.standing.stats.score.value !== 'number' && slot.standing.stats.score.value !== null) {
        nodecg.log.error(
          `Slot has no standing score value. Offending set: ${JSON.stringify(set)} \n\r Offending slot: ${JSON.stringify(slot)}`
        );
        return false;
      }
    }
  });
  if (typeof set.id !== 'string' && typeof set.id !== 'number') {
    nodecg.log.error(`Set has no id. Offending set: ${JSON.stringify(set)}`);
    return false;
  }
  if (!set.phaseGroup) {
    nodecg.log.error(
      `Set has no phaseGroup. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }
  if (
    typeof set.phaseGroup.id !== 'string' &&
    typeof set.phaseGroup.id !== 'number'
  ) {
    nodecg.log.error(
      `Set has no phaseGroup id. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }
  if (!set.phaseGroup.phase) {
    nodecg.log.error(
      `Set has no phaseGroup phase. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }
  if (typeof set.phaseGroup.phase.phaseOrder !== 'number') {
    nodecg.log.error(
      `Set has no phaseGroup phaseOrder. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }
  if (typeof set.wPlacement !== 'number') {
    nodecg.log.error(
      `Set has no wPlacement. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }
  if (typeof set.round !== 'number') {
    nodecg.log.error(`Set has no round. Offending set: ${JSON.stringify(set)}`);
    return false;
  }
  if (!(`winnerId` in set)) {
    nodecg.log.error(
      `Set has no winnerId. Offending set: ${JSON.stringify(set)}`
    );
    return false;
  }

  return true;
}

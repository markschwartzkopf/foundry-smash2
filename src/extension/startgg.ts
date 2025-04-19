import NodeCG from '@nodecg/types';
import { get } from './nodecg-api-context';
import { Tournament, User } from './startgg-types';
import keys from '../keys.json';
import { EventsRep, SelectedEvent, TournamentsRep } from '../global-types';

const nodecg: NodeCG.ServerAPI = get();

const startggApiUrl = 'https://api.start.gg/gql/alpha';

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
  startggFetch(`{currentUser{id slug name tournaments{nodes{name id}}}}`)
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
          return startggFetch(
            `{tournament(id:"${tournament.id}"){events{id name}}}`
          );
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
        eventsRep.value = repEvents;
      }
    })
    .catch((err) => {
      nodecg.log.error('Error fetching update from StartGG:');
      nodecg.log.error(err);
    });
}

nodecg.listenFor('startggRefresh', () => {
  nodecg.log.info('Refreshing StartGG info');
  startggRefresh();
});

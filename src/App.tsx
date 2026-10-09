import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import Snackbar from '@mui/material/Snackbar';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';

import { getState, saveVote, addRestaurant, type State } from './api';

const ME_KEY = 'party-voter:me';

const fmtDate = (d: string) =>
  new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function readMe() {
  try {
    return localStorage.getItem(ME_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeMe(name: string) {
  try {
    localStorage.setItem(ME_KEY, name);
  } catch {
    /* storage blocked: the dropdown still works for this visit */
  }
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [me, setMe] = useState(readMe);
  const [dates, setDates] = useState<string[]>([]);
  const [upvotes, setUpvotes] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({ name: '', link: '', note: '' });

  const refresh = () =>
    getState()
      .then(setState)
      .catch((e) => setToast({ ok: false, msg: e.message }));

  useEffect(() => {
    refresh();
  }, []);

  // Load the selected person's saved choices whenever the person (or the data) changes, unless edits are pending.
  useEffect(() => {
    if (!state || dirty) return;
    const mine = state.votes[me];
    setDates(mine?.dates ?? []);
    setUpvotes(mine?.upvotes ?? []);
  }, [state, me, dirty]);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      setToast({ ok: true, msg: okMsg });
      return true;
    } catch (e) {
      setToast({ ok: false, msg: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const { config, votes, restaurants } = state;
  const team = config.team.length;
  const counts = config.dates.map((d) => ({
    date: d,
    names: Object.values(votes).filter((v) => v.dates.includes(d)).map((v) => v.name),
  }));
  const best = Math.max(0, ...counts.map((c) => c.names.length));
  const notVoted = config.team.filter((n) => !votes[n]);

  return (
    <Box sx={{ bgcolor: 'grey.100', minHeight: '100vh', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="lg">
        <Typography variant="h3" sx={{ mb: 1 }}>
          {config.title}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 4 }}>
          Pick your name, tick the dates you can make, and suggest or upvote a restaurant.
        </Typography>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={3}>
              <Card>
                <CardHeader title="Who are you?" />
                <CardContent>
                  <FormControl fullWidth>
                    <InputLabel id="me-label">Your name</InputLabel>
                    <Select
                      labelId="me-label"
                      label="Your name"
                      value={config.team.includes(me) ? me : ''}
                      onChange={(e) => {
                        setMe(e.target.value);
                        writeMe(e.target.value);
                        setDirty(false);
                      }}
                    >
                      {config.team.map((n) => (
                        <MenuItem key={n} value={n}>
                          {n}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader title="Which dates can you attend?" subheader="Tick every date that works" />
                <CardContent>
                  <Grid container>
                    {config.dates.map((d) => (
                      <Grid key={d} size={{ xs: 12, sm: 6 }}>
                        <FormControlLabel
                          disabled={!me}
                          label={fmtDate(d)}
                          control={
                            <Checkbox
                              checked={dates.includes(d)}
                              onChange={() => {
                                setDates(toggle(dates, d));
                                setDirty(true);
                              }}
                            />
                          }
                        />
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>

              <Card>
                <CardHeader title="Restaurants" subheader="Upvote the places you like" />
                <CardContent>
                  <Stack spacing={1.5}>
                    {restaurants.length === 0 && (
                      <Typography sx={{ color: 'text.secondary' }}>No suggestions yet. Be the first!</Typography>
                    )}
                    {restaurants.map((r) => {
                      const mine = upvotes.includes(r.id);
                      // Show the count as it will be after saving: others' saved votes + my pending choice.
                      const count = r.upvotes.filter((n) => n !== me).length + (mine ? 1 : 0);
                      return (
                        <Stack
                          key={r.id}
                          direction="row"
                          spacing={2}
                          sx={{ alignItems: 'center', p: 1.5, borderRadius: 1, bgcolor: 'grey.100' }}
                        >
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="subtitle1" noWrap>
                              {r.link ? (
                                <Link href={r.link} target="_blank" rel="noopener noreferrer">
                                  {r.name}
                                </Link>
                              ) : (
                                r.name
                              )}
                            </Typography>
                            {r.note && (
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {r.note}
                              </Typography>
                            )}
                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                              suggested by {r.addedBy}
                            </Typography>
                          </Box>
                          <Button
                            disabled={!me}
                            variant={mine ? 'contained' : 'outlined'}
                            color="primary"
                            onClick={() => {
                              setUpvotes(toggle(upvotes, r.id));
                              setDirty(true);
                            }}
                          >
                            ▲ {count}
                          </Button>
                        </Stack>
                      );
                    })}
                  </Stack>

                  <Stack
                    component="form"
                    spacing={2}
                    sx={{ mt: 3 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => addRestaurant({ ...form, addedBy: me }), 'Restaurant added').then(
                        (ok) => ok && setForm({ name: '', link: '', note: '' })
                      );
                    }}
                  >
                    <Typography variant="subtitle2">Suggest a restaurant</Typography>
                    <TextField
                      label="Name"
                      required
                      size="small"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 100 } }}
                    />
                    <TextField
                      label="Link (Google Maps, website…)"
                      type="url"
                      size="small"
                      value={form.link}
                      onChange={(e) => setForm({ ...form, link: e.target.value })}
                    />
                    <TextField
                      label="Note"
                      size="small"
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 300 } }}
                    />
                    <Button type="submit" variant="outlined" disabled={!me || busy} sx={{ alignSelf: 'flex-start' }}>
                      Add suggestion
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <Button
                size="large"
                variant="contained"
                color="inherit"
                disabled={!me || !dirty || busy}
                onClick={() => run(async () => {
                    await saveVote({ name: me, dates, upvotes });
                    setDirty(false);
                  }, 'Your votes are saved 🎉')}
              >
                {dirty ? 'Save my votes' : 'Saved'}
              </Button>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card sx={{ position: { md: 'sticky' }, top: 24 }}>
              <CardHeader title="Results" subheader={`${team - notVoted.length} of ${team} have voted`} />
              <CardContent>
                <Stack spacing={3}>
                  {counts.map(({ date, names }) => {
                    const lead = best > 0 && names.length === best;
                    return (
                      <Box key={date}>
                        <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2">
                            {fmtDate(date)} {lead && <Chip label="Top pick" color="success" size="small" />}
                          </Typography>
                          <Typography variant="subtitle2">
                            {names.length}/{team}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={(names.length / team) * 100}
                          color={lead ? 'success' : 'primary'}
                          sx={{ height: 8, borderRadius: 1 }}
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {names.join(', ') || '—'}
                        </Typography>
                      </Box>
                    );
                  })}

                  {notVoted.length > 0 && (
                    <Alert severity="warning">
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Not voted yet
                      </Typography>
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                        {notVoted.map((n) => (
                          <Chip key={n} label={n} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}>
        <Alert severity={toast?.ok ? 'success' : 'error'} variant="filled" onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

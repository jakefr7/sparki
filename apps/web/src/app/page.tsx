import { PatientSearch } from '../components/patient-search';
import { TodayFloorSnapshot } from '../components/today-floor-snapshot';

export default function HomePage() {
  return (
    <main className="page page--ops">
      <header className="command-home-header command-home-header--ops">
        <div>
          <p className="eyebrow">Sparki</p>
          <h1>Front Desk</h1>
        </div>
        <div className="command-home-header__meta" aria-label="Clinic status">
          <span>Today</span>
          <strong>Open floor</strong>
        </div>
      </header>

      <section className="ops-home" aria-label="Front desk operations">
        <div className="ops-home__primary">
          <div className="ops-search-console">
            <div className="ops-search-console__header">
              <div>
                <p className="eyebrow">Command lookup</p>
                <h2>Find the visit, client, or patient</h2>
              </div>
              <span className="ops-search-console__mode">Live records</span>
            </div>
            <PatientSearch />
          </div>
        </div>

        <aside className="ops-home__rail" aria-label="Today at a glance">
          <TodayFloorSnapshot />
          <section className="ops-queue">
            <p className="eyebrow">Next action model</p>
            <ol>
              <li>
                <span>1</span>
                Identify client and patient
              </li>
              <li>
                <span>2</span>
                Confirm today&apos;s visit state
              </li>
              <li>
                <span>3</span>
                Open, resume, or start care
              </li>
            </ol>
          </section>
        </aside>
      </section>
    </main>
  );
}

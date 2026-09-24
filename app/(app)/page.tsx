"use client";

import { useSession } from "next-auth/react";
import { Car, MapPin } from "lucide-react";
import { DailyJourney } from "../components/DailyJourney";
import { StatsCarousel } from "../components/StatsCarousel";

export default function HomePage() {
  const { data: session } = useSession();
  const profile = session?.profile;
  if (!profile) return null;

  const vehicle = profile.vehicle ?? profile.user.vehicle;
  const vehicleMeta = [vehicle?.vehicle_make?.name, vehicle?.vehicle_model?.name].filter(Boolean).join(" ");

  return (
    <div className="screen-enter">
      <section className="home">
        <DailyJourney />

        <StatsCarousel />

        <section className="panel">
          <h3 className="panel-title"><Car size={16} /> Your vehicle</h3>
          {vehicle ? (
            <>
              <div className="vehicle-top">
                <div>
                  <strong>{vehicle.name}</strong>
                  {vehicleMeta ? <small>{vehicleMeta}</small> : null}
                </div>
                <span className="plate">{vehicle.plate_number}</span>
              </div>
              {vehicle.location_state ? <p className="meta"><MapPin size={16} /> {vehicle.location_state}</p> : null}
            </>
          ) : (
            <p className="empty"><Car size={18} /> No vehicle assigned yet. We&apos;ll notify you once one is ready.</p>
          )}
        </section>
      </section>
    </div>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { Car, MapPin, User } from "lucide-react";
import { StatsCarousel } from "../components/StatsCarousel";

export default function HomePage() {
  const { data: session } = useSession();
  const profile = session?.profile;
  if (!profile) return null;

  const vehicle = profile.vehicle ?? profile.user.vehicle;
  const onShift = profile.user.shift;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const initials = `${profile.user.first_name[0] ?? ""}${profile.user.last_name[0] ?? ""}`.toUpperCase();
  const vehicleMeta = [vehicle?.vehicle_make?.name, vehicle?.vehicle_model?.name].filter(Boolean).join(" ");

  return (
    <div className="screen-enter">
      <section className="home">
        <div className="greeting">
          <span className="avatar">{initials || <User size={20} />}</span>
          <div>
            <small>{greeting}</small>
            <h2>{profile.user.first_name}</h2>
          </div>
          <span className={`pill ${onShift ? "pill-live" : ""}`}>
            <i /> {onShift ? "On shift" : "Off shift"}
          </span>
        </div>

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

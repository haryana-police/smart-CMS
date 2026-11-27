import { readLocationStore } from "./locationMasterService";
import type { Prisma } from "@prisma/client";
import type { TransferableRecord } from "@/lib/recordCustody";
import type { UserSession } from "../types";

type MasterLocation = { id: string; name: string; code: string };
type LocationFields = { district: string; policeStation: string };
type Direction = "id" | "name";

function resolve(value: string, rows: MasterLocation[], direction: Direction): string {
  const byId = rows.find((row) => row.id === value);
  if (byId) return byId[direction];
  if (direction === "name") return value;

  const key = value.trim().toLowerCase();
  if (!key) return value;
  const matches = rows.filter((row) =>
    row.name.trim().toLowerCase() === key || row.code.trim().toLowerCase() === key
  );
  return matches.length === 1 ? matches[0].id : value;
}

export async function readMasterLocationReferences(db?: Prisma.TransactionClient) {
  const { states, ranges, districts, policeStations } = await readLocationStore(db);
  const stationReferences = (district: string) =>
    policeStations.filter((station) => station.districtId === resolve(district, districts, "id"));
  function location<T extends LocationFields>(value: T, direction: Direction): T {
    return {
      ...value,
      district: resolve(value.district, districts, direction),
      policeStation: resolve(value.policeStation, stationReferences(value.district), direction),
    };
  }
  return {
    state: (value: string, direction: Direction) => resolve(value, states, direction),
    range: (value: string, direction: Direction) => resolve(value, ranges, direction),
    district: (value: string, direction: Direction) => resolve(value, districts, direction),
    station: (value: string, district: string, direction: Direction) =>
      resolve(value, stationReferences(district), direction),
    location,
    sessionScope(user: UserSession): UserSession {
      const scope = location({ district: user.district, policeStation: user.stationName }, "id");
      return {
        ...user,
        district: scope.district,
        stationName: scope.policeStation,
        jurisdictionUnits: user.jurisdictionUnits?.map((station) =>
          resolve(station, stationReferences(user.district), "id")
        ),
      };
    },
    caseRecord<T extends LocationFields & TransferableRecord & { complainantDistrict?: string }>(
      value: T, direction: Direction,
    ): T {
      const result = location(value, direction);
      if (value.complainantDistrict) {
        result.complainantDistrict = resolve(value.complainantDistrict, districts, direction);
      }
      if (value.custodyUnit) {
        result.custodyUnit = {
          ...value.custodyUnit,
          district: resolve(value.custodyUnit.district, districts, direction),
        };
      }
      return result;
    },
  };
}

export type MasterLocationReferences = Awaited<ReturnType<typeof readMasterLocationReferences>>;

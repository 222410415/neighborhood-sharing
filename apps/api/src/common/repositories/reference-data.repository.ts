import { Injectable } from "@nestjs/common";
import { FirebaseService } from "../../modules/firebase/firebase.service.js";
import { COLLECTIONS } from "./base.repository.js";
import type {
  Region,
  City,
  Neighborhood,
  Category,
  ReferenceDataResponse,
} from "@neighborhood/contracts";

@Injectable()
export class ReferenceDataRepository {
  constructor(private readonly firebase: FirebaseService) {}

  async getRegions(): Promise<Region[]> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.regions).get();
    return snap.docs.map((d) => d.data() as Region);
  }

  async getCities(): Promise<City[]> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.cities).get();
    return snap.docs.map((d) => d.data() as City);
  }

  async getNeighborhoods(): Promise<Neighborhood[]> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.neighborhoods).get();
    return snap.docs.map((d) => d.data() as Neighborhood);
  }

  async getCategories(): Promise<Category[]> {
    const snap = await this.firebase.firestore
      .collection(COLLECTIONS.categories)
      .get();
    return snap.docs.map((d) => d.data() as Category);
  }

  async getAll(): Promise<ReferenceDataResponse> {
    const [regions, cities, neighborhoods, categories] = await Promise.all([
      this.getRegions(),
      this.getCities(),
      this.getNeighborhoods(),
      this.getCategories(),
    ]);
    return { regions, cities, neighborhoods, categories };
  }
}

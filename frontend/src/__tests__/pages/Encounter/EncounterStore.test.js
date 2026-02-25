import axios from "axios";
import { toast } from "react-toastify";
import EncounterStore from "../../../pages/Encounter/stores/EncounterStore";
import * as helperFunctions from "../../../pages/Encounter/stores/helperFunctions";

jest.mock("axios");
jest.mock("react-toastify", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock("../../../pages/Encounter/stores/helperFunctions", () => ({
  validateFieldValue: jest.fn(),
  getValueAtPath: jest.fn(),
  setValueAtPath: jest.fn(),
  deleteValueAtPath: jest.fn(),
  expandOperations: jest.fn((ops) => ops),
  setEncounterState: jest.fn(),
}));
jest.mock("@flowjs/flow.js", () => {
  return jest.fn().mockImplementation(() => ({
    assignBrowse: jest.fn(),
    on: jest.fn(),
    upload: jest.fn(),
    progress: jest.fn(() => 0),
    files: [],
  }));
});

describe("EncounterStore", () => {
  let store;
  let mockIntl;

  beforeEach(() => {
    jest.clearAllMocks();

    store = new EncounterStore();
    mockIntl = {
      formatMessage: jest.fn(({ defaultMessage, id }) => defaultMessage || id),
    };
    store.setIntl(mockIntl);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("Initialization", () => {
    it("initializes with default values and child stores", () => {
      expect(store.encounterData).toBeNull();
      expect(store.overviewActive).toBe(true);
      expect(store.editDateCard).toBe(false);
      expect(store.lat).toBeNull();
      expect(store.lon).toBeNull();

      expect(store.modals).toBeDefined();
      expect(store.errors).toBeDefined();
      expect(store.newMatch).toBeDefined();
      expect(store.imageModal).toBeDefined();
    });
  });

  describe("Encounter Data Management", () => {
    it("sets encounter data and derived fields", () => {
      const mockData = {
        id: "enc-123",
        locationGeoPoint: { lat: 40.7128, lon: -74.006 },
        metalTags: [{ location: "left-fin", number: "001" }],
        acousticTag: { serialNumber: "A123" },
        satelliteTag: { name: "SAT-001" },
        measurements: [
          { type: "length", value: 150, units: "cm" },
          { type: null, value: 100 }, // filtered out
          { type: "weight", value: 50 },
        ],
      };

      store.setEncounterData(mockData);

      expect(store.encounterData).toEqual(mockData);
      expect(store.lat).toBe(40.7128);
      expect(store.lon).toBe(-74.006);
      expect(store.metalTagValues).toEqual(mockData.metalTags);
      expect(store.acousticTagValues).toEqual(mockData.acousticTag);
      expect(store.satelliteTagValues).toEqual(mockData.satelliteTag);
      expect(store.measurementValues).toHaveLength(2);
      expect(store.measurementValues.map((m) => m.type)).toEqual([
        "length",
        "weight",
      ]);
    });

    it("handles missing locationGeoPoint", () => {
      store.setEncounterData({ id: "enc-123" });
      expect(store.lat).toBeNull();
      expect(store.lon).toBeNull();
    });
  });

  describe("Coordinates", () => {
    it("setLat validates latitude/longitude", () => {
      helperFunctions.validateFieldValue.mockReturnValue(null);

      store.setLat(12.34);

      expect(store.lat).toBe(12.34);
      expect(helperFunctions.validateFieldValue).toHaveBeenCalledWith(
        "location",
        "latitude",
        12.34,
        expect.any(Object),
      );
    });

    it("setLon validates latitude/longitude", () => {
      helperFunctions.validateFieldValue.mockReturnValue(null);

      store.setLon(56.78);

      expect(store.lon).toBe(56.78);
      expect(helperFunctions.validateFieldValue).toHaveBeenCalled();
    });
  });

  describe("Person Management", () => {
    beforeEach(() => {
      store.setEncounterData({ id: "enc-123" });
    });

    it("adds a person successfully", async () => {
      store.setNewPersonName("John Doe");
      store.setNewPersonEmail("john@example.com");
      store.setNewPersonRole("submitter");

      axios.patch.mockResolvedValue({ status: 200 });

      await store.addNewPerson();

      expect(axios.patch).toHaveBeenCalledWith("/api/v3/encounters/enc-123", [
        { op: "add", path: "submitter", value: "john@example.com" },
      ]);
      expect(toast.success).toHaveBeenCalled();
      expect(store.newPersonName).toBe("");
      expect(store.newPersonEmail).toBe("");
      expect(store.newPersonRole).toBe("");
    });

    it("throws and toasts on add person error", async () => {
      store.setNewPersonEmail("john@example.com");
      store.setNewPersonRole("submitter");
      axios.patch.mockRejectedValue(new Error("Network error"));

      await expect(store.addNewPerson()).rejects.toThrow("Network error");
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("Search (debounced)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      store.setEncounterData({
        id: "enc-123",
        taxonomy: "Balaenoptera musculus",
      });
    });

    it("debounces individual search and sends latest query", async () => {
      axios.post.mockResolvedValue({ data: { hits: [] } });

      store.setIndividualSearchInput("W");
      store.setIndividualSearchInput("Wh");
      store.setIndividualSearchInput("Wha");

      expect(axios.post).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      await Promise.resolve();

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        "/api/v3/search/individual?size=20&from=0",
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.arrayContaining([
                expect.objectContaining({
                  wildcard: expect.objectContaining({
                    names: expect.objectContaining({ value: "*Wha*" }),
                  }),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it("clears individual search results for short input", () => {
      store.setIndividualSearchInput("W");
      jest.advanceTimersByTime(300);
      expect(store.individualSearchResults).toEqual([]);
    });

    it("debounces sighting search and sends latest query", async () => {
      axios.post.mockResolvedValue({ data: { hits: [] } });

      store.setSightingSearchInput("s");
      store.setSightingSearchInput("si");
      store.setSightingSearchInput("sig");

      jest.advanceTimersByTime(300);
      await Promise.resolve();

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        "/api/v3/search/occurrence?size=20&from=0",
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                expect.objectContaining({
                  wildcard: expect.objectContaining({
                    id: expect.objectContaining({ value: "*sig*" }),
                  }),
                }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  describe("Measurement Management", () => {
    beforeEach(() => {
      store.setEncounterData({ id: "enc-123" });
      store.setSiteSettings({
        measurement: ["length", "weight"],
        measurementUnits: ["cm", "kg"],
        behaviorOptions: { "": [] },
      });
    });

    it("returns default measurement shape when not found", () => {
      expect(store.getMeasurement("weight")).toEqual({
        type: "weight",
        value: "",
        units: "kg",
        samplingProtocol: "",
      });
    });

    it("sets and updates measurement values", () => {
      store.setMeasurementValue("length", 100);
      store.setMeasurementSamplingProtocol("length", "standard");
      store.setMeasurementValue("length", 150);

      expect(store.measurementValues).toHaveLength(1);
      expect(store.measurementValues[0]).toEqual(
        expect.objectContaining({
          type: "length",
          value: 150,
          units: "cm",
          samplingProtocol: "standard",
        }),
      );
    });
  });

  describe("Tracking Patch Operations", () => {
    it("builds tracking payload when values changed", () => {
      store.setEncounterData({
        id: "enc-123",
        metalTags: [{ location: "dorsal", number: "001" }],
        acousticTag: { serialNumber: "A123" },
      });

      store.setMetalTagValues([{ location: "dorsal", number: "002" }]);
      store.setAcousticTagValues({ serialNumber: "A456", idNumber: "ID789" });

      const ops = store.buildTrackingPatchPayload();

      expect(ops).toContainEqual({
        op: "replace",
        path: "metalTags",
        value: { location: "dorsal", number: "002" },
      });
      expect(ops).toContainEqual({
        op: "replace",
        path: "acousticTag",
        value: { serialNumber: "A456", idNumber: "ID789" },
      });
    });

    it("returns empty ops when nothing changed", () => {
      store.setEncounterData({
        id: "enc-123",
        metalTags: [{ location: "dorsal", number: "001" }],
        acousticTag: { serialNumber: "A123" },
        satelliteTag: { name: "SAT-001" },
      });

      expect(store.buildTrackingPatchPayload()).toEqual([]);
    });
  });

  describe("Save Operations", () => {
    beforeEach(() => {
      store.setEncounterData({ id: "enc-123" });
    });

    it("patchMeasurements sends remove op when measurement value is empty", async () => {
      store._measurementValues = [
        { type: "length", value: "", units: "cm", samplingProtocol: "" },
      ];
      axios.patch.mockResolvedValue({ status: 200 });

      await store.patchMeasurements();

      expect(axios.patch).toHaveBeenCalledWith(
        "/api/v3/encounters/enc-123",
        [{ op: "remove", path: "measurements", value: "length" }],
        { headers: { "Content-Type": "application/json" } },
      );
    });

    it("saveSection success path", async () => {
      store.setEncounterData({ id: "enc-123", verbatimEventDate: "old-value" });

      helperFunctions.getValueAtPath.mockImplementation(
        (obj, path) => obj?.[path],
      );
      helperFunctions.expandOperations.mockImplementation((ops) => ops);
      axios.patch.mockResolvedValue({ status: 200 });

      store._sectionDrafts.set("date", { verbatimEventDate: "new-value" });

      await store.saveSection("date", "enc-123");

      expect(helperFunctions.expandOperations).toHaveBeenCalledWith(
        [{ op: "replace", path: "verbatimEventDate", value: "new-value" }],
        [],
      );

      expect(axios.patch).toHaveBeenCalledWith("/api/v3/encounters/enc-123", [
        { op: "replace", path: "verbatimEventDate", value: "new-value" },
      ]);

      expect(toast.success).toHaveBeenCalledWith("Changes saved successfully!");
    });

    describe("Site Settings", () => {
      it("derives options from site settings", () => {
        store.setEncounterData({
          id: "enc-123",
          species: "Balaenoptera musculus",
        });

        store.setSiteSettings({
          siteTaxonomies: [
            { scientificName: "Balaenoptera musculus" },
            { scientificName: "Megaptera novaeangliae" },
          ],
          livingStatus: ["alive", "dead"],
          sex: ["male", "female"],
          lifeStage: ["juvenile", "adult"],
          behaviorOptions: {
            "": ["feeding"],
            "Balaenoptera musculus": ["diving"],
          },
          behavior: ["resting"],
          groupRoles: ["leader"],
          patterningCode: ["P1"],
          metalTagsEnabled: true,
          acousticTagEnabled: true,
        });

        expect(store.taxonomyOptions).toHaveLength(2);
        expect(store.livingStatusOptions).toHaveLength(2);
        expect(store.sexOptions).toHaveLength(2);
        expect(store.lifeStageOptions).toHaveLength(2);
        expect(store.behaviorOptions.length).toBeGreaterThan(0);
        expect(store.metalTagsEnabled).toBe(true);
        expect(store.acousticTagEnabled).toBe(true);
      });
    });

    describe("Encounter Annotations / Match Result Clickable", () => {
      it("filters encounter annotations by selected image and encounter id", () => {
        store.setEncounterData({
          id: "enc-123",
          mediaAssets: [
            {
              annotations: [
                { id: "ann-1", encounterId: "enc-123" },
                { id: "ann-2", encounterId: "enc-456" },
                { id: "ann-3", encounterId: "enc-123" },
              ],
            },
          ],
        });

        store.setSelectedImageIndex(0);

        expect(store.encounterAnnotations.map((a) => a.id)).toEqual([
          "ann-1",
          "ann-3",
        ]);
      });

      it("returns true when match result is clickable", () => {
        store.setEncounterData({
          id: "enc-123",
          mediaAssets: [
            {
              detectionStatus: "complete",
              annotations: [
                {
                  id: "ann-1",
                  encounterId: "enc-123",
                  iaTaskId: "task-123",
                  iaTaskParameters: { skipIdent: false },
                  identificationStatus: "complete",
                },
              ],
            },
          ],
        });

        store.setSelectedImageIndex(0);
        store.setSelectedAnnotationId("ann-1");

        expect(store.matchResultClickable).toBe(true);
      });

      it("returns false when skipIdent is true", () => {
        store.setEncounterData({
          id: "enc-123",
          mediaAssets: [
            {
              detectionStatus: "complete",
              annotations: [
                {
                  id: "ann-1",
                  encounterId: "enc-123",
                  iaTaskId: "task-123",
                  iaTaskParameters: { skipIdent: true },
                  identificationStatus: "complete",
                },
              ],
            },
          ],
        });

        store.setSelectedImageIndex(0);
        store.setSelectedAnnotationId("ann-1");

        expect(store.matchResultClickable).toBe(false);
      });
    });

    describe("Refresh Encounter Data", () => {
      it("refreshes encounter data and preserves selected image index", async () => {
        store.setEncounterData({
          id: "enc-123",
          mediaAssets: [{}, {}, {}],
        });
        store.setSelectedImageIndex(2);

        const updatedData = {
          id: "enc-123",
          mediaAssets: [{}, {}, {}],
        };

        axios.get.mockResolvedValue({ status: 200, data: updatedData });

        const result = await store.refreshEncounterData();

        expect(axios.get).toHaveBeenCalledWith("/api/v3/encounters/enc-123");
        expect(store.encounterData).toEqual(updatedData);
        expect(store.selectedImageIndex).toBe(2);
        expect(result).toEqual(updatedData);
      });

      it("throws on refresh error and shows toast", async () => {
        store.setEncounterData({ id: "enc-123" });
        axios.get.mockRejectedValue(new Error("Network error"));

        await expect(store.refreshEncounterData()).rejects.toThrow(
          "Network error",
        );
        expect(toast.error).toHaveBeenCalled();
      });
    });

    describe("Drafts / Patch local apply", () => {
      it("getFieldValue returns draft value first", () => {
        store.setEncounterData({ id: "enc-123", time: "old-time" });
        store._sectionDrafts.set("date", { time: "new-time" });

        const value = store.getFieldValue("date", "time");

        expect(value).toBe("new-time");
      });

      it("setFieldValue stores draft and validates", () => {
        helperFunctions.validateFieldValue.mockReturnValue(null);

        store.setFieldValue("date", "time", "new-time");

        expect(store._sectionDrafts.get("date")).toEqual(
          expect.objectContaining({ time: "new-time" }),
        );
        expect(helperFunctions.validateFieldValue).toHaveBeenCalledWith(
          "date",
          "time",
          "new-time",
        );
      });

      it("resets all drafts", () => {
        store._sectionDrafts.set("date", { time: "value" });
        store._sectionDrafts.set("location", { lat: 40 });

        store.resetAllDrafts();

        expect(store._sectionDrafts.get("date")).toEqual({});
        expect(store._sectionDrafts.get("location")).toEqual({});
      });

      it("applies patch operations locally", () => {
        store.setEncounterData({
          id: "enc-123",
          taxonomy: "Species A",
        });

        helperFunctions.setValueAtPath.mockImplementation(
          (obj, path, value) => {
            obj[path] = value;
          },
        );

        store.applyPatchOperationsLocally([
          { op: "replace", path: "taxonomy", value: "Species B" },
        ]);

        expect(helperFunctions.setValueAtPath).toHaveBeenCalled();
      });
    });
  });
});

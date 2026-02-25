/* eslint-disable react/display-name */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import ManualAnnotation from "../../../pages/ManualAnnotation";

jest.mock("mobx-react-lite", () => ({
  observer: (Comp) => Comp,
}));

jest.mock("../../../ThemeColorProvider", () => {
  const React = require("react");
  return React.createContext({
    primaryColors: { primary500: "#1677ff" },
    defaultColors: { white: "#fff" },
  });
});

jest.mock("../../../components/MainButton", () => (props) => (
  <button onClick={props.onClick} disabled={props.loading}>
    {props.children}
  </button>
));

jest.mock("react-select", () => {
  const MockReactSelect = (props) => {
    const options = props.options || [];
    return (
      <select
        data-testid="mock-select"
        value={props.value?.value || ""}
        onChange={(e) => {
          const selected = options.find((o) => o.value === e.target.value) || {
            value: e.target.value,
            label: e.target.value,
          };
          props.onChange?.(selected);
        }}
      >
        <option value="">--</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  };
  MockReactSelect.displayName = "MockReactSelect";
  return MockReactSelect;
});

const mockCreateAnnotation = jest.fn();

jest.mock("../../../models/encounters/useCreateAnnotation", () => () => ({
  createAnnotation: mockCreateAnnotation,
  loading: false,
  error: null,
  submissionDone: false,
  responseData: { id: "annotation123" },
}));

jest.mock("../../../models/useGetSiteSettings", () => () => ({
  data: {
    iaClassesForTaxonomy: { testTaxonomy: ["Zebra", "Elephant"] },
    annotationViewpoint: ["Front", "Side"],
  },
}));

jest.mock("../../../components/AnnotationSuccessful", () => {
  const Mock = () => <div data-testid="annotation-success">Success!</div>;
  Mock.displayName = "MockAnnotationSuccessful";
  return Mock;
});

jest.mock("../../../components/AddAnnotationModal", () => {
  const Mock = (props) =>
    props.showModal ? <div data-testid="annotation-modal">Modal</div> : null;
  Mock.displayName = "MockAddAnnotationModal";
  return Mock;
});

jest.mock("../../../components/ResizableRotatableRect", () => {
  const Mock = (props) => (
    <div data-testid="resizable-rect">
      <button
        data-testid="set-valid-rect"
        onClick={() =>
          props.setRect({
            x: 10,
            y: 20,
            width: 100,
            height: 80,
            rotation: 0,
          })
        }
      >
        set-rect
      </button>
    </div>
  );
  Mock.displayName = "MockResizableRotatableRect";
  return Mock;
});

jest.mock("../../../models/js/calculateScaleFactor", () =>
  jest.fn(() => ({ x: 1, y: 1 })),
);

jest.mock("../../../models/js/calculateFinalRect", () =>
  jest.fn((rect) => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: rect.rotation || 0,
  })),
);

Object.defineProperty(global.Image.prototype, "complete", {
  get() {
    return true;
  },
});

HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  clearRect: jest.fn(),
  strokeRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
}));

const defaultFetchPayload = {
  width: 800,
  height: 600,
  url: "test.jpg",
  annotations: [
    {
      encounterId: "2",
      encounterTaxonomy: "testTaxonomy",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      theta: 0.3,
      trivial: false,
    },
  ],
};

const mockFetchWith = (payload = defaultFetchPayload) => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve(payload),
    }),
  );
};

const renderComponent = (url = "/manual-annotation?assetId=1&encounterId=2") =>
  render(
    <IntlProvider locale="en" messages={{}}>
      <MemoryRouter initialEntries={[url]}>
        <ManualAnnotation />
      </MemoryRouter>
    </IntlProvider>,
  );

describe("ManualAnnotation (basic coverage)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAnnotation.mockClear();
    mockFetchWith();
  });

  test("renders form and drawing area", async () => {
    renderComponent();

    expect(await screen.findByText("DRAW_ANNOTATION")).toBeInTheDocument();
    expect(screen.getByText("SAVE_ANNOTATION")).toBeInTheDocument();
    expect(screen.getByTestId("resizable-rect")).toBeInTheDocument();

    expect(screen.getAllByTestId("mock-select")).toHaveLength(2);
  });

  test("shows modal when saving with missing required fields", async () => {
    renderComponent();

    fireEvent.click(await screen.findByText("SAVE_ANNOTATION"));

    await waitFor(() => {
      expect(screen.getByTestId("annotation-modal")).toBeInTheDocument();
    });

    expect(mockCreateAnnotation).not.toHaveBeenCalled();
  });

  test("submits annotation when IA, viewpoint and rect are provided", async () => {
    renderComponent();

    await screen.findByText("DRAW_ANNOTATION");

    const [iaSelect, viewpointSelect] = screen.getAllByTestId("mock-select");

    fireEvent.change(iaSelect, { target: { value: "Zebra" } });
    fireEvent.change(viewpointSelect, { target: { value: "Front" } });

    fireEvent.click(screen.getByTestId("set-valid-rect"));

    fireEvent.click(screen.getByText("SAVE_ANNOTATION"));

    await waitFor(() => {
      expect(mockCreateAnnotation).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreateAnnotation.mock.calls[0][0];
    expect(payload.encounterId).toBe("2");
    expect(payload.assetId).toBe("1");
    expect(payload.ia).toEqual({ value: "Zebra", label: "Zebra" });
    expect(payload.viewpoint).toEqual({ value: "Front", label: "Front" });
    expect(payload.width).toBeGreaterThan(0);
    expect(payload.height).toBeGreaterThan(0);
  });
});

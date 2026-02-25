/* eslint-disable react/display-name */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import SearchAndSelectInput from "../../components/generalInputs/SearchAndSelectInput";

jest.mock("react-intl", () => ({
  FormattedMessage: ({ id }) => <span>{id}</span>,
}));

let latestCreatableProps;
jest.mock("react-select/creatable", () => {
  const React = require("react");
  return (props) => {
    latestCreatableProps = props;
    return (
      <div data-testid="creatable-mock">
        <span data-testid="creatable-value">
          {props.value ? props.value.label : ""}
        </span>
      </div>
    );
  };
});

describe("SearchAndSelectInput (basic)", () => {
  beforeEach(() => {
    latestCreatableProps = undefined;
  });

  test("renders label and passes options to creatable select", () => {
    render(
      <SearchAndSelectInput
        label="MY_LABEL"
        value=""
        onChange={jest.fn()}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    );

    expect(screen.getByText("MY_LABEL")).toBeInTheDocument();
    expect(screen.getByTestId("creatable-mock")).toBeInTheDocument();
    expect(latestCreatableProps.options).toEqual([
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
  });

  test("shows value even when it is not in options", () => {
    render(
      <SearchAndSelectInput
        label="X"
        value="not-exist"
        onChange={jest.fn()}
        options={[{ value: "a", label: "A" }]}
      />,
    );

    expect(latestCreatableProps.value).toEqual({
      value: "not-exist",
      label: "not-exist",
    });
    expect(screen.getByTestId("creatable-value")).toHaveTextContent(
      "not-exist",
    );
  });

  test("selecting an existing option calls onChange with the option value", () => {
    const handleChange = jest.fn();

    render(
      <SearchAndSelectInput
        label="L"
        value=""
        onChange={handleChange}
        options={[{ value: "x", label: "X" }]}
      />,
    );

    act(() => {
      latestCreatableProps.onChange({ value: "x", label: "X" });
    });

    expect(handleChange).toHaveBeenCalledWith("x");
  });

  test("creating a new option calls onChange with the created value", () => {
    const handleChange = jest.fn();

    render(
      <SearchAndSelectInput
        label="L"
        value=""
        onChange={handleChange}
        options={[]}
      />,
    );

    act(() => {
      latestCreatableProps.onCreateOption("NewOne");
    });

    expect(handleChange).toHaveBeenCalledWith("NewOne");
  });

  test("maps keepMenuOpenOnSelect to closeMenuOnSelect", () => {
    const { rerender } = render(
      <SearchAndSelectInput
        label="L"
        value=""
        onChange={jest.fn()}
        options={[]}
      />,
    );

    expect(latestCreatableProps.closeMenuOnSelect).toBe(true);

    rerender(
      <SearchAndSelectInput
        label="L"
        value=""
        onChange={jest.fn()}
        options={[]}
        keepMenuOpenOnSelect={true}
      />,
    );

    expect(latestCreatableProps.closeMenuOnSelect).toBe(false);
  });
});

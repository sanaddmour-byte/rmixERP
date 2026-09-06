import * as React from "react";
import { PanResponder, Text, View } from "react-native";
import { Button } from "./Button";
import { colors } from "../theme";

const PAD_HEIGHT = 160;

export interface SignaturePadHandle {
  /** An SVG data URI built from the captured strokes, or null if nothing was drawn. */
  toDataUri(): string | null;
  clear(): void;
}

/**
 * A dependency-free freehand signature capture — React Native has no
 * built-in canvas, and this project avoids reaching for a signature-pad
 * library the same way `PickerField` avoids a picker library. Strokes are
 * recorded as point lists and rendered live as small dots; on submit
 * they're serialized into a real SVG image (a `data:image/svg+xml` URI,
 * renderable anywhere an <img>/signature viewer expects one — see web's
 * DispatchPage proof-of-delivery display) rather than a placeholder.
 */
export const SignaturePad = React.forwardRef<SignaturePadHandle, { onChange?: (hasSignature: boolean) => void }>(
  ({ onChange }, ref) => {
    const [strokes, setStrokes] = React.useState<{ x: number; y: number }[][]>([]);
    const currentStroke = React.useRef<{ x: number; y: number }[]>([]);
    const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
    const width = React.useRef(0);

    const panResponder = React.useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          currentStroke.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          forceRender();
        },
        onPanResponderMove: (e) => {
          currentStroke.current = [...currentStroke.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          forceRender();
        },
        onPanResponderRelease: () => {
          setStrokes((prev) => [...prev, currentStroke.current]);
          currentStroke.current = [];
        },
      }),
    ).current;

    React.useEffect(() => {
      onChange?.(strokes.length > 0);
    }, [strokes, onChange]);

    React.useImperativeHandle(ref, () => ({
      clear: () => {
        setStrokes([]);
        currentStroke.current = [];
      },
      toDataUri: () => {
        if (strokes.length === 0) return null;
        const w = width.current || 300;
        const paths = strokes
          .map((stroke) => {
            if (stroke.length === 0) return "";
            const [first, ...rest] = stroke;
            const d = [`M ${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`, ...rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)].join(" ");
            return `<path d="${d}" stroke="black" stroke-width="2" fill="none" stroke-linecap="round"/>`;
          })
          .join("");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${PAD_HEIGHT}" viewBox="0 0 ${w} ${PAD_HEIGHT}">${paths}</svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      },
    }));

    return (
      <View style={{ gap: 6 }}>
        <View
          onLayout={(e) => {
            width.current = e.nativeEvent.layout.width;
          }}
          {...panResponder.panHandlers}
          style={{ height: PAD_HEIGHT, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: "#fff", overflow: "hidden" }}
        >
          {strokes.length === 0 && currentStroke.current.length === 0 && (
            <Text style={{ position: "absolute", top: PAD_HEIGHT / 2 - 8, alignSelf: "center", color: colors.textFaint }}>
              Sign here
            </Text>
          )}
          {[...strokes, currentStroke.current].flatMap((stroke, si) =>
            stroke.map((p, pi) => (
              <View
                key={`${si}-${pi}`}
                style={{
                  position: "absolute",
                  left: p.x - 1.5,
                  top: p.y - 1.5,
                  width: 3,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: colors.navy,
                }}
              />
            )),
          )}
        </View>
        <Button
          label="Clear"
          variant="outline"
          onPress={() => {
            setStrokes([]);
            currentStroke.current = [];
            forceRender();
          }}
        />
      </View>
    );
  },
);
SignaturePad.displayName = "SignaturePad";
